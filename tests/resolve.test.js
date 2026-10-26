import test from "node:test";
import assert from "node:assert/strict";
import { mapPicks, decide, isGenericPage, resolveQuery } from "../worker/src/resolve.js";

const results = [
  { title: "Official programme", url: "https://www.iitgn.ac.in/srip", description: "d" },
  { title: "Reddit thread", url: "https://www.reddit.com/r/x/comments/1", description: "d" },
  { title: "Listing", url: "https://opportunitydesk.org/srip", description: "d" },
];

test("R-RES-4 indexes out of range or repeated are dropped; model cannot add URLs", () => {
  const c = mapPicks([{ i: 1, confidence: 0.9, source_kind: "official" }, { i: 1, confidence: 0.9 }, { i: 99, confidence: 1 }, { i: 0, confidence: 1 }, { url: "https://evil.com", confidence: 1 }], results);
  assert.equal(c.length, 1);
  assert.equal(c[0].official_url, "https://www.iitgn.ac.in/srip");
});

test("R-RES-1/3 a forum or listing host is never reported as official, whatever the model says", () => {
  const c = mapPicks([{ i: 2, confidence: 0.95, source_kind: "official" }, { i: 3, confidence: 0.9, source_kind: "official" }], results);
  assert.equal(c.find((x) => x.official_url.includes("reddit")).source_kind, "forum");
  assert.equal(c.find((x) => x.official_url.includes("opportunitydesk")).source_kind, "aggregator");
});

const cand = (confidence, url = "https://a.edu/p", kind = "official") => ({ official_url: url, source_kind: kind, confidence, name: "n" });

test("R-RES-5 single / multiple / none", () => {
  assert.equal(decide([cand(0.9), cand(0.3, "https://b.edu/p")]).outcome, "single");
  assert.equal(decide([cand(0.9), cand(0.7, "https://b.edu/p")]).outcome, "multiple");
  assert.equal(decide([cand(0.5)]).outcome, "multiple");
  assert.equal(decide([cand(0.2)]).outcome, "none");
  assert.equal(decide([]).outcome, "none");
});

test("R-RES-6 a home page is not a programme", () => {
  assert.ok(isGenericPage("https://www.cmu.edu/"));
  assert.ok(!isGenericPage("https://www.cmu.edu/math/undergrad/suami"));
  const d = decide([cand(0.95, "https://www.cmu.edu/")]);
  assert.equal(d.outcome, "none");
  assert.ok(d.message);
});

test("R-RES-7 only listing pages -> aggregator_only with leads", () => {
  const d = decide([cand(0.9, "https://opportunitydesk.org/x", "aggregator")]);
  assert.equal(d.outcome, "aggregator_only");
  assert.equal(d.candidates.length, 1);
});

test("R-RES-2 a typed institutional URL is used directly, 0 credits, no model call", async () => {
  const emit = { stage() {} };
  const out = await resolveQuery({ MODEL_PUBLIC: "x" }, { query: "https://www.cmu.edu/math/undergrad/suami" }, emit, {
    search: () => { throw new Error("must not search"); },
    scrape: () => { throw new Error("must not scrape"); },
  });
  assert.equal(out.outcome, "single");
  assert.equal(out.candidates[0].official_url, "https://www.cmu.edu/math/undergrad/suami");
});

test("R-RES-2/R-RES-6 a typed home-page URL is refused", async () => {
  const out = await resolveQuery({}, { query: "https://www.cmu.edu/" }, { stage() {} }, {});
  assert.equal(out.outcome, "none");
});
