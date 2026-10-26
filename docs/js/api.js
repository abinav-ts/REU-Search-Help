// Talks to the Worker. POST + Server-Sent Events can't use EventSource (it only does GET),
// so we read the response stream ourselves. Spec 05 "SSE protocol".
import { WORKER_URL } from "./config.js";

// Calls onEvent(name, data) for each event: "stage", "result", "error".
// Resolves when the stream ends. Throws {code, message} for non-stream errors (401, 400...).
export async function postStream(path, body, demoKey, onEvent, signal) {
  let res;
  try {
    res = await fetch(WORKER_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-Key": demoKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw { code: "network", message: "Could not reach the server. Check your connection and try again." };
  }
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await res.json().catch(() => ({}));
    throw data.error || { code: "upstream_error", message: "Unexpected reply from the server." };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const name = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (name && data) onEvent(name, JSON.parse(data));
    }
  }
}

// Plain JSON POST for /api/profile and /api/match. Throws {code, message} on any problem.
export async function postJSON(path, body, demoKey) {
  let res;
  try {
    res = await fetch(WORKER_URL + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Demo-Key": demoKey }, body: JSON.stringify(body) });
  } catch {
    throw { code: "network", message: "Could not reach the server." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data.error || { code: "upstream_error", message: "Unexpected reply from the server." };
  return data;
}
