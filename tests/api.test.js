import test from "node:test";
import assert from "node:assert/strict";

// api.js imports config.js (a browser module with a constant); both are plain ES modules.
import { postStream } from "../docs/js/api.js";

function sseBody(chunks) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  });
}

test("SSE client: events split across chunks are reassembled; keepalive comments ignored", async () => {
  globalThis.fetch = async () =>
    new Response(sseBody([
      'event: stage\ndata: {"id":"reading","mess',
      'age":"Reading x"}\n\n: keepalive\n\nevent: res',
      'ult\ndata: {"name":"Prog","n":1}\n\n',
    ]), { headers: { "content-type": "text/event-stream" } });
  const got = [];
  await postStream("/api/extract", { url: "u" }, "k", (n, d) => got.push([n, d]));
  assert.deepEqual(got, [["stage", { id: "reading", message: "Reading x" }], ["result", { name: "Prog", n: 1 }]]);
});

test("SSE client: a JSON error (e.g. 401) is thrown with its code", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { code: "unauthorized", message: "Missing or wrong demo key." } }), { status: 401, headers: { "content-type": "application/json" } });
  await assert.rejects(postStream("/api/resolve", {}, "bad", () => {}), (e) => e.code === "unauthorized");
});
