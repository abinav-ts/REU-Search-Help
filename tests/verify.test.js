import test from "node:test";
import assert from "node:assert/strict";
import { anyRuleSupported, countryListConflict, pruneUnsupportedCountries,normaliseForMatch, makeEvidenceChecker, cleanField, verifyField, computeCycleState } from "../worker/src/verify.js";

const PAGE = `Eligibility: Applicants must be citizens or permanent
residents of the United States. Students in their
sophomore or junior year are preferred.`;

test("R-EXT-9 normaliseForMatch ignores case, punctuation and whitespace", () => {
  assert.equal(normaliseForMatch("  Hello,\n  WORLD! "), "hello world");
  assert.equal(normaliseForMatch("Kalaignar’s"), "kalaignar s");
});

test("R-EXT-9 exact quote across a line break is found", () => {
  const check = makeEvidenceChecker([PAGE]);
  assert.ok(check("Applicants must be citizens or permanent residents of the United States"));
});

test("R-EXT-9 fabricated quote is not found", () => {
  const check = makeEvidenceChecker([PAGE]);
  assert.ok(!check("Applicants from any country may apply and receive full funding"));
  assert.ok(!check(""));
  assert.ok(!check(null));
});

test("R-EXT-9 fuzzy match tolerates a small deviation, rejects a larger one", () => {
  const check = makeEvidenceChecker([PAGE + " More text follows here about the program and its goals for students."]);
  assert.ok(check("Students in their sophomore or junior year are preferred"));
  assert.ok(!check("Students in their final year are strongly required to hold a degree"));
});

test("R-EXT-9 two-part quote (conflict) needs both parts", () => {
  const check = makeEvidenceChecker([PAGE]);
  assert.ok(check("citizens or permanent residents of the United States ‖ sophomore or junior year are preferred"));
  assert.ok(!check("citizens or permanent residents of the United States ‖ invented sentence about nothing at all"));
});

test("R-EXT-9 verifyField downgrades an unverified stated field to ambiguous", () => {
  const check = makeEvidenceChecker([PAGE]);
  const notes = [];
  const f = verifyField({ status: "stated", value: 1, evidence: "totally made up quote about money", source_url: "u" }, check, "sop_count", notes);
  assert.equal(f.status, "ambiguous");
  assert.equal(f.evidence_verified, false);
  assert.equal(notes.length, 1);
});

test("H2 cleanField: stated with no value is not_found; not_found is emptied", () => {
  assert.equal(cleanField({ status: "stated", value: null, evidence: "x" }).status, "not_found");
  assert.equal(cleanField({ status: "not_found", value: 3, evidence: "q" }).value, null);
  assert.equal(cleanField({ status: "weird", value: 1 }).status, "not_found");
  assert.equal(cleanField(undefined).status, "not_found");
});

test("R-EXT-10 computeCycleState uses today's date, not the model", () => {
  const today = new Date("2026-10-27T00:00:00Z");
  assert.equal(computeCycleState("2026-01-31", 2026, today).state, "closed");
  assert.equal(computeCycleState("2027-02-01", 2027, today).state, "upcoming");
  assert.equal(computeCycleState(null, null, today).state, "unknown");
  assert.ok(computeCycleState("2025-02-01", 2025, today).notes.length === 1);
});

test("R-EXT-16 quotes joined with ... or ‖ are checked part by part", () => {
  const check = makeEvidenceChecker([PAGE]);
  assert.ok(check("Applicants must be citizens or permanent residents ... sophomore or junior year are preferred"));
  assert.ok(!check("Applicants must be citizens or permanent residents ... a sentence that is not there at all"));
});

import { countryVariants, COUNTRY_NAMES } from "../docs/js/eligibility.js";
test("H2 countries not named in the quote are dropped; aliases like U.S. still count", () => {
  const r = pruneUnsupportedCountries(["India", "Australia", "United States"], "students from India, Brazil and the U.S.", countryVariants);
  assert.deepEqual(r.kept, ["India", "United States"]);
  assert.deepEqual(r.removed, ["Australia"]);
});

test("H2/F7 two pages naming different country lists are reported as a conflict", () => {
  const old = { url: "https://m.ca/main", text: "Open to students from: Australia, Brazil, Chile, China, Colombia, France and Germany. Apply early." };
  const nu = { url: "https://m.ca/students", text: "Open to students from the following: Austria, Brazil, Chile, China, India, Ireland and Jordan.\nMore text." };
  const c = countryListConflict([old, nu], COUNTRY_NAMES, countryVariants);
  assert.ok(c);
  assert.ok(c.b.countries.includes("India") && !c.a.countries.includes("India"));
  const same = countryListConflict([old, { url: "x", text: old.text }], COUNTRY_NAMES, countryVariants);
  assert.equal(same, null);
  assert.equal(countryListConflict([old], COUNTRY_NAMES, countryVariants), null);
});

test("H2 rule 'any' needs explicit wording", () => {
  assert.ok(anyRuleSupported("Applicants of all nationalities are welcome"));
  assert.ok(anyRuleSupported("open to international students"));
  assert.ok(anyRuleSupported("regardless of citizenship"));
  assert.ok(!anyRuleSupported("I am a native of India, presently studying abroad. Can I apply? You are welcome to apply."));
  assert.ok(!anyRuleSupported(null));
});
