// Gemini provider (the "public lane": only public page text and the typed query may go here, H9).
// Only this file knows the Gemini REST shape. Checked against the AI Studio docs on 26 Oct 2026:
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
//   header x-goog-api-key, body {contents, generationConfig:{responseMimeType, responseJsonSchema}}
//   the answer text is at candidates[0].content.parts[0].text

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// One call to one model, no retries. Returns a plain result object instead of throwing,
// so callers can decide about fallback (spec 05 R-BE-12).
export async function callGemini({ apiKey, model, system, user, schema, thinking, timeoutMs = 60000 }) {
  const generationConfig = {
    temperature: 0,
    responseMimeType: "application/json",
    responseJsonSchema: schema,
  };
  // Optional: lower the model's "thinking" effort (slower models spend a lot of time on it).
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };

  const body = { contents: [{ role: "user", parts: [{ text: user }] }], generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - started;
    if (!res.ok) {
      // Keep only Google's short error message; it never contains our key.
      return { ok: false, status: res.status, ms, error: String(data?.error?.message || res.statusText).slice(0, 300) };
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
    const u = data?.usageMetadata || {};
    return {
      ok: true,
      status: res.status,
      ms,
      text,
      usage: { input: u.promptTokenCount, output: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount },
    };
  } catch (e) {
    // Timeout or dropped connection.
    return { ok: false, status: 0, ms: Date.now() - started, error: e?.name === "TimeoutError" ? "timeout" : "network_error" };
  }
}
