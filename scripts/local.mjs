// Run the Worker in plain Node, no server and no wrangler (works inside restricted shells).
//   node scripts/local.mjs POST /api/extract '{"url":"https://..."}'
//   node scripts/local.mjs GET  /api/health
// Secrets come from worker/.dev.vars (git-ignored; this script reads it, you never print it).
// KV is a JSON file in .local-cache/ so page text is cached between runs and costs 0 credits.
import fs from "node:fs";
import worker from "../worker/src/index.js";

// The Worker logs with console.log; keep stdout clean for the result JSON.
const out = (text) => process.stdout.write(text + "\n");
console.log = (...a) => console.error(...a);

import { env } from "./localenv.mjs";
import { installFakeFirecrawl } from "./fake-firecrawl.mjs";

// FAKE_FIRECRAWL=1 stands in for Firecrawl scraping when no Firecrawl key is available (testing only).
if (process.env.FAKE_FIRECRAWL) { env.FIRECRAWL_API_KEY ||= "fake"; installFakeFirecrawl(); }

const [method = "GET", urlPath = "/api/health", bodyArg] = process.argv.slice(2);
// a body starting with @ means "read it from that file"
const body = bodyArg?.startsWith("@") ? fs.readFileSync(bodyArg.slice(1), "utf8") : bodyArg;
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const t0 = Date.now();
const res = await worker.fetch(
  new Request("http://local" + urlPath, {
    method,
    headers: { "X-Demo-Key": env.DEMO_KEY, Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" },
    body: method === "GET" ? undefined : body,
  }),
  env,
  ctx
);

const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + "s";
if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (!ev) continue;
      if (ev === "stage") console.error(`[${secs()}] stage: ${JSON.parse(data).message}`);
      else if (ev === "error") console.error(`[${secs()}] ERROR: ${data}`);
      else out(data); // result JSON on stdout
    }
  }
} else {
  out(res.status + " " + (await res.text()));
}
await Promise.all(pending);
