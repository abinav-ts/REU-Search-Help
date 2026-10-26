// REU Brief Worker — M0 skeleton: health check, CORS, demo-key check, ping.
// Later milestones add /api/resolve, /api/extract, /api/profile, /api/match (see specs/05).

import { callGemini } from "./providers/gemini.js";

const VERSION = "0.0.2-m0";

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

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    // Browsers send an OPTIONS "preflight" before cross-site requests with custom headers.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // Health check needs no key (spec 05 R-BE-3).
    if (url.pathname === "/api/health") {
      return json(
        { ok: true, version: VERSION, credits_used: null, credits_cap: Number(env.FIRECRAWL_MONTHLY_CAP || 0) },
        200,
        cors
      );
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

    return json({ error: { code: "bad_input", message: "Unknown endpoint.", retryable: false } }, 404, cors);
  },
};
