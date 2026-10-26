import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// ---- a tiny stand-in for the browser DOM: enough for render.js (elements, text nodes, attributes) ----
class Node_ { constructor() { this.children = []; this.attrs = {}; this.className = ""; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  setAttribute(k, v) { this.attrs[k] = v; }
  get text() { return this.children.map((c) => (c.isText ? c.data : c.text)).join(" "); }
  walk(fn) { fn(this); for (const c of this.children) if (!c.isText) c.walk(fn); }
}
globalThis.document = {
  createElement: (tag) => Object.assign(new Node_(), { tag }),
  createTextNode: (data) => ({ isText: true, data }),
};
const { renderResult, safeLink } = await import("../docs/js/render.js");
const { evaluate } = await import("../docs/js/eligibility.js");

const load = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/program-${n}.json`, import.meta.url), "utf8"));
const india = { citizenships: ["India"], permanent_residency: [], institution_country: "India", degree_level: "bachelors", year_of_study: 3, gpa: null, fields_of_study: [], interests: [], skills: [] };
const all = (root, pred) => { const out = []; root.walk((n) => pred(n) && out.push(n)); return out; };

for (const name of ["mitacs", "cmu-suami", "iitgn-srip"]) {
  test(`U5 ${name}: renders; no 'undefined'/'null'/'[object' text; not_found fields show no value`, () => {
    const p = load(name);
    const dom = renderResult(p, evaluate(p, india), true);
    const text = dom.text;
    assert.ok(text.includes(p.name));
    assert.ok(!/undefined|\[object|\bnull\b/.test(text), "stray placeholder text found");
    assert.ok(text.includes("Not stated on the site") || !Object.values(p.logistics).some((f) => f.status === "not_found"));
    // every fact that is shown has a status marker; every source link is https
    for (const a of all(dom, (n) => n.tag === "a")) assert.ok(a.attrs.href.startsWith("https://"), a.attrs.href);
    for (const a of all(dom, (n) => n.tag === "a")) assert.match(a.attrs.rel, /noopener/);
  });
}

test("U7 a <script> in a field renders as text, never as an element or attribute", () => {
  const p = load("cmu-suami");
  p.name = "<script>alert(1)</script>";
  p.research.problem_statement = { status: "stated", value: '<img src=x onerror=alert(1)>', evidence: "<b>q</b>", source_url: "javascript:alert(1)" };
  const dom = renderResult(p, evaluate(p, india), true);
  assert.equal(all(dom, (n) => n.tag === "script" || n.tag === "img" || n.tag === "b").length, 0);
  assert.ok(dom.text.includes("<script>alert(1)</script>"));
  // the javascript: URL is not made into a link
  assert.equal(all(dom, (n) => n.tag === "a" && /javascript/i.test(n.attrs.href || "")).length, 0);
});

test("safeLink only links https", () => {
  assert.equal(safeLink("https://a.edu/x", "t").tag, "a");
  assert.equal(safeLink("http://a.edu/x", "t").tag, "span");
  assert.equal(safeLink("javascript:alert(1)", "t").tag, "span");
  assert.equal(safeLink("not a url", "t").tag, "span");
});

test("R-PRO-3 without a complete profile the verdict area asks for the profile and never says eligible", () => {
  const dom = renderResult(load("mitacs"), null, false);
  assert.ok(dom.text.includes("Add your profile to get an eligibility verdict"));
  assert.ok(!/Eligible on the stated rules/.test(dom.text));
});

test("U6 changing the citizenship flips the verdict without a new lookup (Mitacs fixture, conflicting lists)", () => {
  const p = load("mitacs");
  // the two pages disagree about the country list, so the citizenship field is ambiguous -> unclear
  assert.equal(p.eligibility.citizenship.status, "ambiguous");
  assert.equal(evaluate(p, india).verdict, "unclear");
  // the same record with an unambiguous US-only rule flips the verdict for an Indian profile
  const q = structuredClone(p);
  q.eligibility.citizenship = { status: "stated", value: { rule: "citizens_only", countries: ["United States"] }, evidence: "US citizens only", source_url: "https://example.edu/p", evidence_verified: true };
  assert.equal(evaluate(q, india).verdict, "not_eligible");
  assert.equal(evaluate(q, { ...india, citizenships: ["United States"] }).verdict === "not_eligible", false);
});

test("Not eligible banner shows the deciding quote and its source link", () => {
  const p = load("mitacs");
  p.eligibility.citizenship = { status: "stated", value: { rule: "citizens_only", countries: ["United States"] }, evidence: "Open to US citizens only.", source_url: "https://example.edu/p", evidence_verified: true };
  const dom = renderResult(p, evaluate(p, india), true);
  const banner = all(dom, (n) => /verdict-not_eligible/.test(n.className))[0];
  assert.ok(banner);
  assert.ok(banner.text.includes("Open to US citizens only."));
  assert.ok(all(banner, (n) => n.tag === "a" && n.attrs.href === "https://example.edu/p").length === 1);
});
