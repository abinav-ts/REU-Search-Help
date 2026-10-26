// Fill the cache before a demo (spec 05 R-BE-9). Runs each query through the LIVE Worker so the
// answers are stored for 72 h (resolve + extract) and demo-day lookups are instant and cost no credits.
//
//   DEMO_KEY=... node worker/scripts/prewarm.mjs https://reu-brief.<you>.workers.dev "Mitacs Globalink Research Internship" "CMU SUAMI"
//
// Options (env): TTL_HOURS (default 72), REFRESH=1 to re-read pages even if cached (spends credits).
// Costs about 7 Firecrawl credits per programme the first time; run each query once, not in a loop.
const [base, ...queries] = process.argv.slice(2);
const key = process.env.DEMO_KEY;
const ttl = Number(process.env.TTL_HOURS || 72);
if (!base || !queries.length || !key) {
  console.error('Usage: DEMO_KEY=... node worker/scripts/prewarm.mjs <worker-url> "<query or url>" ["<query>" ...]');
  process.exit(2);
}

async function stream(path, body) {
  const res = await fetch(base.replace(/\/$/, "") + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Demo-Key": key }, body: JSON.stringify(body) });
  if (!(res.headers.get("content-type") || "").includes("text/event-stream")) {
    const d = await res.json().catch(() => ({}));
    return { error: d.error || { code: "http_" + res.status } };
  }
  const text = await res.text();
  let result = null, error = null;
  for (const block of text.split("\n\n")) {
    const ev = block.match(/^event: (.*)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1];
    if (ev === "result") result = JSON.parse(data);
    if (ev === "error") error = JSON.parse(data);
  }
  return { result, error };
}

for (const q of queries) {
  const t0 = Date.now();
  const r = await stream("/api/resolve", { query: q, ttl_hours: ttl });
  if (r.error) { console.log(`✗ ${q}: resolve ${r.error.code}`); continue; }
  const out = r.result;
  if (out.outcome !== "single") { console.log(`• ${q}: resolve → ${out.outcome} (${out.candidates.length} candidates; nothing to extract)`); continue; }
  const url = out.candidates[0].official_url;
  const e = await stream("/api/extract", { url, ttl_hours: ttl, refresh: process.env.REFRESH === "1" });
  if (e.error) { console.log(`✗ ${q}: extract ${e.error.code}`); continue; }
  const p = e.result;
  console.log(`✓ ${q} → ${p.name} | pages ${p.meta.pages_read.filter((x) => x.ok).length}/${p.meta.pages_read.length} | credits ${p.meta.credits_used ?? 0} | cache ${p.meta.from_cache} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
