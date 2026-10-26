// Workers AI provider: the PRIVATE lane (spec 05). Anything derived from the user (CV text,
// interests, skills) may only be sent here, never to Gemini (H9).
// Request: env.AI.run(model, {messages, response_format:{type:"json_schema", json_schema}, ...})
// The reply's `response` is an object or a JSON string depending on the model; accept both.
import { ApiError } from "../errors.js";

export async function runJSON(env, { system, user, schema, maxTokens = 1200 }) {
  if (!env.AI || !env.MODEL_PRIVATE) throw new ApiError("upstream_error", "The private model is not configured.", false, 500);
  let lastProblem = "bad_json";
  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try {
      out = await env.AI.run(env.MODEL_PRIVATE, {
        messages: [
          { role: "system", content: system + (attempt ? "\nYour previous answer was not valid JSON for the schema. Return ONLY the JSON object." : "") },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: schema },
        max_tokens: maxTokens,
        temperature: 0,
      });
    } catch (e) {
      // Never put the error's text in logs or replies: it can echo the prompt (which holds user data).
      console.log("workers-ai call failed:", e?.name || "error");
      lastProblem = "call_failed";
      continue;
    }
    const raw = out?.response ?? out;
    if (raw && typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      lastProblem = "bad_json";
    }
  }
  if (lastProblem === "call_failed") throw new ApiError("upstream_error", "The private model is busy. Try again in a minute.", true, 502);
  throw new ApiError("extraction_incomplete", "The answer could not be read. Please try again.", true, 502);
}
