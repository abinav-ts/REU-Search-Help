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
      // Default: the first model in the MODEL_PUBLIC fallback list.
      const model = url.searchParams.get("model") || (env.MODEL_PUBLIC || "").split(",")[0].trim();
      if (!/^gemini-[a-z0-9.-]+$/.test(model)) {
        return json({ error: { code: "bad_input", message: "Give ?model=<gemini model id>.", retryable: false } }, 400, cors);
      }
      const r = await callGemini({
        apiKey: env.GEMINI_API_KEY,
        model,
        user: 'Return JSON {"ok": true}',
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        thinking: url.searchParams.get("thinking") || undefined,
        timeoutMs: 45000,
      });
      let jsonValid = false;
      try { jsonValid = JSON.parse(r.text).ok === true; } catch { /* not valid JSON */ }
      return json({ model, http_status: r.status, ms: r.ms, json_valid: jsonValid, usage: r.usage, error: r.error }, 200, cors);
    }

    return json({ error: { code: "bad_input", message: "Unknown endpoint.", retryable: false } }, 404, cors);
  },
};
