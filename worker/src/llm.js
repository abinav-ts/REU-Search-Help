// The only doors to a language model (spec 05 "llm.js"):
//   publicJSON  -> Gemini. Public page text and the typed query ONLY (H9).
//   privateJSON -> Workers AI. Anything derived from the user (CV, profile). Added in M5.
// resolve.js and extract.js may call publicJSON only (test B8 checks this).
import { callGemini } from "./providers/gemini.js";
import { runJSON } from "./providers/workersai.js";
import { ApiError } from "./errors.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Walk MODEL_PUBLIC (comma-separated fallback list) as in spec 05 R-BE-12:
//  - 429/503: wait ~2 s, retry the same model once, then move to the next model
//  - timeout / network error: move to the next model straight away (no second long wait)
//  - invalid JSON: one more try on the same model, then next model
// Throws ApiError: quota_exhausted (all busy), timeout, extraction_incomplete, upstream_error.
export async function publicJSON(env, { system, user, schema, timeoutMs = 60000, deadline }) {
  const models = (env.MODEL_PUBLIC || "").split(",").map((m) => m.trim()).filter(Boolean);
  if (!models.length) throw new ApiError("upstream_error", "No model is configured.", false);
  const seen = { busy: 0, timeout: 0, badJson: 0, other: 0 };

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline ? deadline - Date.now() : timeoutMs;
      if (left < 8000) throw new ApiError("timeout", "The lookup took too long. Please try again.", true, 504);
      const r = await callGemini({
        apiKey: env.GEMINI_API_KEY, model, system, user, schema,
        timeoutMs: Math.min(timeoutMs, left - 2000),
      });
      console.log(`llm model=${model} status=${r.status} ms=${r.ms} tokens=${JSON.stringify(r.usage || {})}`);
      if (r.ok) {
        try {
          return JSON.parse(r.text);
        } catch {
          seen.badJson++;
          continue; // try the same model once more
        }
      }
      if (r.status === 429 || r.status === 503) {
        seen.busy++;
        if (attempt === 0) { await wait(2000); continue; }
        break;
      }
      if (r.status === 0) { seen.timeout++; break; }
      seen.other++;
      break; // 400/403/404: this model will not work, try the next one
    }
  }
  if (seen.busy) throw new ApiError("quota_exhausted", "The free model quota is reached. Try again in a minute.", true, 429);
  if (seen.timeout) throw new ApiError("timeout", "The model took too long. Please try again.", true, 504);
  if (seen.badJson) throw new ApiError("extraction_incomplete", "The model's answer could not be read. Please try again.", true, 502);
  throw new ApiError("upstream_error", "The language model is unavailable right now.", true, 502);
}

// The private lane: Workers AI. CV parsing and shared-fields matching only (profile.js, match.js).
export function privateJSON(env, opts) {
  return runJSON(env, opts);
}
