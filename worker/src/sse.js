// Server-Sent Events helper (spec 05 "SSE protocol").
// run(emit) does the work and calls emit.stage(id, message) and emit.result(data).
// Anything it throws becomes an `error` event. A comment line every 10 s keeps proxies open.
import { toApiError } from "./errors.js";

export function sseResponse(cors, ctx, run) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let closed = false;

  const write = async (text) => {
    if (closed) return;
    try {
      await writer.write(enc.encode(text));
    } catch {
      closed = true; // the browser went away; stop writing, never crash (acceptance B5)
    }
  };
  const send = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const keepalive = setInterval(() => write(": keepalive\n\n"), 10000);

  const task = (async () => {
    try {
      await run({
        stage: (id, message) => send("stage", { id, message }),
        result: (data) => send("result", data),
        isOpen: () => !closed,
      });
    } catch (e) {
      const err = toApiError(e);
      console.log(`lookup failed code=${err.code}`); // the code only, never any content (R-BE-7)
      await send("error", err.toJSON());
    } finally {
      clearInterval(keepalive);
      closed = true;
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();
  ctx.waitUntil(task);

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...cors },
  });
}
