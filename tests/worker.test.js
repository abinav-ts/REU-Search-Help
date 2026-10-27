import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker, { rateLimited } from "../worker/src/index.js";

const env = { DEMO_KEY: "secret", ALLOWED_ORIGIN: "https://abinav-ts.github.io", FIRECRAWL_MONTHLY_CAP: "900" };
const ctx = { waitUntil() {} };
const call = (path, init = {}, e = env) => worker.fetch(new Request("http://x" + path, init), e, ctx);

test("B1 /health works without a key; a wrong or missing X-Demo-Key gets 401 unauthorized", async () => {
  assert.equal((await call("/api/health")).status, 200);
  const bad = await call("/api/ping", { headers: { "X-Demo-Key": "nope", "CF-Connecting-IP": "1.1.1.1" } });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error.code, "unauthorized");
  assert.equal((await call("/api/ping", { headers: { "CF-Connecting-IP": "1.1.1.2" } })).status, 401);
  assert.equal((await call("/api/ping", { headers: { "X-Demo-Key": "secret", "CF-Connecting-IP": "1.1.1.3" } })).status, 200);
});

test("B2 only the Pages origin (and localhost) gets CORS headers", async () => {
  const ok = await call("/api/health", { headers: { Origin: "https://abinav-ts.github.io" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://abinav-ts.github.io");
  const other = await call("/api/health", { headers: { Origin: "https://evil.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
  const pre = await call("/api/extract", { method: "OPTIONS", headers: { Origin: "https://abinav-ts.github.io" } });
  assert.equal(pre.status, 204);
});

test("B3 rate limit: the 31st request in ten minutes from one IP gets 429 rate_limited", () => {
  const e = { RATE_LIMIT: "30" };
  const t = 1_000_000;
  for (let i = 0; i < 30; i++) assert.equal(rateLimited("9.9.9.9", e, t + i), false);
  assert.equal(rateLimited("9.9.9.9", e, t + 31), true);
  assert.equal(rateLimited("8.8.8.8", e, t + 31), false); // another IP is unaffected
  assert.equal(rateLimited("9.9.9.9", e, t + 11 * 60 * 1000), false); // window passed
});

test("bad_input for an empty extract body, unknown endpoint is 404", async () => {
  const h = { "X-Demo-Key": "secret", "CF-Connecting-IP": "2.2.2.2" };
  assert.equal((await call("/api/nothing", { headers: h })).status, 404);
  const r = await call("/api/extract", { method: "POST", headers: h, body: "not json" });
  assert.equal(r.status, 400);
});

test("B8 privacy routing: public-lane code never touches the private lane and vice versa", () => {
  const src = (f) => fs.readFileSync(new URL(`../worker/src/${f}`, import.meta.url), "utf8");
  for (const f of ["resolve.js", "extract.js"]) {
    assert.ok(!/privateJSON|workersai|env\.AI\b/.test(src(f)), `${f} must not use the private lane`);
  }
  for (const f of ["profile.js", "match.js"]) {
    try { assert.ok(!/publicJSON|providers\/gemini/.test(src(f)), `${f} must not use the public lane`); } catch (e) { if (e.code === "ENOENT") continue; throw e; }
  }
  // the Gemini provider is imported only by llm.js and the diagnostics endpoint
  for (const f of fs.readdirSync(new URL("../worker/src/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
    if (["llm.js", "index.js"].includes(f)) continue;
    assert.ok(!/providers\/gemini/.test(src(f)), `${f} must not import the Gemini provider`);
  }
});

test("B6 no API key strings in the repo source", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name === ".git" || e.name === ".local-cache" || e.name === ".wrangler" ? [] : e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const root = new URL("..", import.meta.url).pathname;
  for (const f of walk(root).filter((x) => /\.(js|mjs|json|toml|md|html|sh|py)$/.test(x) && !x.endsWith(".dev.vars"))) {
    const t = fs.readFileSync(f, "utf8");
    assert.ok(!/AIza[0-9A-Za-z_-]{30,}|fc-[a-f0-9]{24,}|sk-[A-Za-z0-9]{30,}/.test(t), `key-like string in ${f}`);
  }
});

test("R-BE-3 REQUIRE_DEMO_KEY=false opens the app endpoints without a key, but never the Gemini diagnostics", async () => {
  const open = { ...env, REQUIRE_DEMO_KEY: "false" };
  const h = { "CF-Connecting-IP": "5.5.5.5" };
  assert.equal((await call("/api/ping", { headers: h }, open)).status, 200);
  const r = await call("/api/extract", { method: "POST", headers: h, body: "not json" }, open);
  assert.equal(r.status, 400); // got past authorisation and failed on the body instead
  assert.equal((await call("/api/diag/gemini", { headers: h }, open)).status, 401);
  assert.equal((await call("/api/diag/gemini?model=gemini-x", { headers: { ...h, "X-Demo-Key": "secret" } }, { ...open, GEMINI_API_KEY: "k" })).status, 200);
  // still required when the switch is on (default)
  assert.equal((await call("/api/ping", { headers: { "CF-Connecting-IP": "5.5.5.6" } }, { ...env, REQUIRE_DEMO_KEY: "true" })).status, 401);
});
