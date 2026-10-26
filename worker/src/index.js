// REU Brief Worker: routes, CORS, demo-key check, rate limit (spec 05).
// The real work lives in resolve.js and extract.js; this file only decides who may call what.

import { callGemini } from "./providers/gemini.js";
import { sseResponse } from "./sse.js";
import { extractProgram } from "./extract.js";
import { resolveQuery } from "./resolve.js";
import { parseCv } from "./profile.js";
import { matchProfile } from "./match.js";
import { toApiError } from "./errors.js";
import { makeCache, creditsKey } from "./cache.js";

const VERSION = "0.1.0";

// R-BE-4: best-effort rate limit, kept in this isolate's memory (NOT in KV: free KV allows few writes).
// It resets when the isolate restarts, which is fine for stopping casual abuse.
const hits = new Map();
export function rateLimited(ip, env, now = Date.now()) {
  const limit = Number(env.RATE_LIMIT || 30);
  const windowMs = 10 * 60 * 1000;
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return recent.length > limit;
}

// Only the GitHub Pages site (and local testing) may call this Worker from a browser.
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    origin === env.ALLOWED_ORIGIN ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const base = { Vary: "Origin" };
  if (!allowed) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Demo-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

// Optional cache lifetime for pre-warming (R-BE-9): 1 to 168 hours, else the default.
const ttl = (body) => (Number.isFinite(body.ttl_hours) && body.ttl_hours >= 1 && body.ttl_hours <= 168 ? Math.floor(body.ttl_hours) : undefined);

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);

    // Browsers send an OPTIONS "preflight" before cross-site requests with custom headers.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // Health check needs no key (spec 05 R-BE-3). It also shows this month's Firecrawl credit use.
    if (url.pathname === "/api/health") {
      const used = Number((await makeCache(env).get(creditsKey()))?.used ?? 0);
      return json({ ok: true, version: VERSION, credits_used: used, credits_cap: Number(env.FIRECRAWL_MONTHLY_CAP || 0) }, 200, cors);
    }

    // Rate limit every other request, before the key check, so guessing the key is slow too.
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (rateLimited(ip, env)) {
      return json({ error: { code: "rate_limited", message: "Too many requests. Wait a few minutes and try again.", retryable: true } }, 429, cors);
    }

    // Everything else needs the demo key.
    if (!env.DEMO_KEY || request.headers.get("X-Demo-Key") !== env.DEMO_KEY) {
      return json(
        { error: { code: "unauthorized", message: "Missing or wrong demo key.", retryable: false } },
        401,
        cors
      );
    }

    if (url.pathname === "/api/ping") {
      return json({ ok: true, message: "Worker says hi", time: new Date().toISOString() }, 200, cors);
    }

    // One tiny Gemini call so we can see which model is fast and available (spec 05).
    // Costs one Gemini request per call; it is behind the demo key like everything else.
    if (url.pathname === "/api/diag/gemini") {
      // With ?model=<id>: test just that model once.
      // Without it: walk the MODEL_PUBLIC fallback list (R-BE-12): per model, retry once on
      // 429/503 after 2 s, then move to the next model; stop at the first success.
      const asked = url.searchParams.get("model");
      const models = asked ? [asked] : (env.MODEL_PUBLIC || "").split(",").map((m) => m.trim()).filter(Boolean);
      if (!models.length || !models.every((m) => /^gemini-[a-z0-9.-]+$/.test(m))) {
        return json({ error: { code: "bad_input", message: "Give ?model=<gemini model id>.", retryable: false } }, 400, cors);
      }
      const attempts = [];
      let last = null;
      let jsonValid = false;
      for (const model of models) {
        for (let tryNo = 0; tryNo < (asked ? 1 : 2); tryNo++) {
          if (tryNo > 0) await new Promise((r) => setTimeout(r, 2000));
          last = await callGemini({
            apiKey: env.GEMINI_API_KEY,
            model,
            user: 'Return JSON {"ok": true}',
            schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
            thinking: url.searchParams.get("thinking") || undefined,
            timeoutMs: 30000,
          });
          last.model = model;
          attempts.push({ model, http_status: last.status, ms: last.ms });
          jsonValid = false;
          try { jsonValid = JSON.parse(last.text).ok === true; } catch { /* not valid JSON */ }
          if (last.ok || (last.status !== 429 && last.status !== 503)) break; // only retry busy errors
        }
        if (last.ok) break;
      }
      return json({ model: last.model, http_status: last.status, ms: last.ms, json_valid: jsonValid, usage: last.usage, error: last.error, attempts }, 200, cors);
    }

    // POST /api/profile {text}  and  POST /api/match {profile, program}: private lane, plain JSON.
    // Neither stores anything (no KV) and neither logs the request body (H7).
    if ((url.pathname === "/api/profile" || url.pathname === "/api/match") && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return json({ error: { code: "bad_input", message: "Send a JSON body.", retryable: false } }, 400, cors);
      }
      try {
        const out = url.pathname === "/api/profile" ? await parseCv(env, { text: body.text }) : await matchProfile(env, body);
        return json(out, 200, cors);
      } catch (e) {
        const err = toApiError(e);
        return json({ error: err.toJSON() }, err.status || 500, cors);
      }
    }

    // POST /api/resolve  {query, hints?}  -> SSE (spec 05)
    if (url.pathname === "/api/resolve" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return json({ error: { code: "bad_input", message: "Send a JSON body.", retryable: false } }, 400, cors);
      }
      return sseResponse(cors, ctx, async (emit) => {
        const out = await resolveQuery(env, { query: body.query, hints: body.hints, ttlHours: ttl(body) }, emit);
        await emit.result(out);
      });
    }

    // POST /api/extract  {url} or {pasted_text, source_hint?}, refresh?  -> SSE (spec 05)
    if (url.pathname === "/api/extract" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return json({ error: { code: "bad_input", message: "Send a JSON body.", retryable: false } }, 400, cors);
      }
      return sseResponse(cors, ctx, async (emit) => {
        const program = await extractProgram(env, {
          url: typeof body.url === "string" ? body.url.trim() : undefined,
          pasted_text: typeof body.pasted_text === "string" ? body.pasted_text : undefined,
          source_hint: typeof body.source_hint === "string" ? body.source_hint.slice(0, 500) : undefined,
          refresh: body.refresh === true,
          ttlHours: ttl(body),
        }, emit);
        await emit.result(program);
      });
    }

    return json({ error: { code: "bad_input", message: "Unknown endpoint.", retryable: false } }, 404, cors);
  },
};
