import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, normalizeCountry, expandCountries } from "../docs/js/eligibility.js";

// ---- helpers: build a programme and profile quickly ----
const stated = (value, evidence = "quote", source_url = "https://example.edu/p") => ({ status: "stated", value, evidence, source_url });
const nf = () => ({ status: "not_found", value: null, evidence: null, source_url: null });
const amb = (value) => ({ status: "ambiguous", value, evidence: "unclear quote", source_url: "https://example.edu/p" });

const prog = (over = {}) => ({
  eligibility: {
    citizenship: stated({ rule: "any", countries: [] }),
    career_stage: stated({ levels: ["bachelors"], min_year: null, max_year: null, must_be_currently_enrolled: null }),
    institution: nf(), min_gpa: nf(), fields_of_study: nf(), other_requirements: nf(),
    ...over,
  },
});
const me = (over = {}) => ({
  citizenships: ["India"], permanent_residency: [], institution_country: "India",
  degree_level: "bachelors", year_of_study: 3, gpa: null, fields_of_study: [], interests: [], skills: [], ...over,
});
const cit = (rule, countries) => ({ citizenship: stated({ rule, countries }) });
const get = (v, name) => v.checks.find((c) => c.criterion === name);

// ---- R-ELG-1 / R-ELG-2: countries ----
test("R-ELG-1 aliases map to canonical names; unknown stays; never throws", () => {
  for (const a of ["Indian", "IN", "Bharat", "india", "  India  "]) assert.equal(normalizeCountry(a), "India");
  for (const a of ["USA", "U.S.", "United States of America", "US"]) assert.equal(normalizeCountry(a), "United States");
  for (const a of ["UK", "Britain", "U.K."]) assert.equal(normalizeCountry(a), "United Kingdom");
  assert.equal(normalizeCountry("Atlantis"), "Atlantis");
  assert.equal(normalizeCountry(null), "");
  assert.equal(normalizeCountry(undefined), "");
});

test("R-ELG-2 EU and EEA expand; other groups are unknown groups", () => {
  assert.ok(expandCountries(["EU"]).set.has("Germany"));
  assert.ok(!expandCountries(["EU"]).set.has("Norway"));
  assert.ok(expandCountries(["EEA"]).set.has("Norway"));
  assert.equal(expandCountries(["Commonwealth"]).unknownGroup, true);
  assert.equal(expandCountries(["developing countries"]).unknownGroup, true);
  assert.equal(expandCountries(["India", "Nepal"]).unknownGroup, false);
});

// ---- Truth table (spec 03) ----
test("R-ELG-5 row 1: citizens_only [US] vs citizen of India -> not_eligible, with the quote", () => {
  const v = evaluate(prog(cit("citizens_only", ["United States"])), me());
  assert.equal(v.verdict, "not_eligible");
  assert.match(v.summary, /^Not eligible: the programme is open to citizens of United States only \(you hold India\)\.$/);
  assert.equal(get(v, "Citizenship").evidence, "quote");
  assert.equal(get(v, "Citizenship").source_url, "https://example.edu/p");
});

test("R-ELG-5 row 2: citizens_or_pr [US], citizen India, no PR -> not_eligible", () => {
  assert.equal(evaluate(prog(cit("citizens_or_pr", ["United States"])), me()).verdict, "not_eligible");
});

test("R-ELG-5 row 3: citizens_or_pr [US], PR in US -> eligible", () => {
  const v = evaluate(prog(cit("citizens_or_pr", ["United States"])), me({ permanent_residency: ["United States"] }));
  assert.equal(v.verdict, "eligible");
});

test("R-ELG-3 row 4: any -> citizenship pass", () => {
  assert.equal(get(evaluate(prog(cit("any", [])), me()), "Citizenship").result, "pass");
});

test("R-ELG-3 row 5: listed_countries [India, Nepal], citizen India -> pass", () => {
  assert.equal(get(evaluate(prog(cit("listed_countries", ["India", "Nepal"])), me()), "Citizenship").result, "pass");
});

test("R-ELG-5 row 6: excludes_countries [India], citizen India -> fail -> not_eligible", () => {
  const v = evaluate(prog(cit("excludes_countries", ["India"])), me());
  assert.equal(get(v, "Citizenship").result, "fail");
  assert.equal(v.verdict, "not_eligible");
});

test("R-ELG-4 row 7: ambiguous citizenship -> unknown -> unclear", () => {
  const v = evaluate(prog({ citizenship: amb({ rule: "citizens_only", countries: ["United States"] }) }), me());
  assert.equal(get(v, "Citizenship").result, "unknown");
  assert.equal(v.verdict, "unclear");
});

test("R-ELG-4 row 8: not_found citizenship -> unknown -> unclear", () => {
  const v = evaluate(prog({ citizenship: nf() }), me());
  assert.equal(get(v, "Citizenship").result, "unknown");
  assert.equal(v.verdict, "unclear");
});

test("R-ELG-5 row 9: a stated citizenship fail dominates other unknowns", () => {
  const v = evaluate(prog({ ...cit("citizens_only", ["United States"]), career_stage: nf() }), me());
  assert.equal(v.verdict, "not_eligible");
});

test("R-ELG-5 row 10: citizenship + stage pass, GPA unknown -> eligible, GPA listed as unknown", () => {
  const v = evaluate(prog({ min_gpa: stated({ value: 3.0, scale: 4 }) }), me());
  assert.equal(v.verdict, "eligible");
  assert.equal(get(v, "GPA").result, "unknown");
});

test("R-ELG-3 row 10b: institution not_found does not block eligible", () => {
  const v = evaluate(prog(), me());
  assert.equal(v.verdict, "eligible");
  assert.equal(get(v, "Institution").result, "unknown");
});

test("R-ELG-3 row 10c: citizenship pass, career stage not_found -> unclear", () => {
  assert.equal(evaluate(prog({ career_stage: nf() }), me()).verdict, "unclear");
});

test("R-ELG-3 row 11: bachelors years 2-3 vs year 1 -> stage fail", () => {
  const p = prog({ career_stage: stated({ levels: ["bachelors"], min_year: 2, max_year: 3, must_be_currently_enrolled: null }) });
  assert.equal(get(evaluate(p, me({ year_of_study: 1 })), "Career stage").result, "fail");
  assert.equal(get(evaluate(p, me({ year_of_study: 2 })), "Career stage").result, "pass");
  assert.equal(get(evaluate(p, me({ year_of_study: 4 })), "Career stage").result, "fail");
});

test("R-ELG-3 row 12: levels [bachelors] vs masters -> stage fail -> not_eligible", () => {
  const v = evaluate(prog(), me({ degree_level: "masters" }));
  assert.equal(get(v, "Career stage").result, "fail");
  assert.equal(v.verdict, "not_eligible");
});

test("R-ELG-3 row 13: levels [bachelors, masters], masters, year null, no bounds -> pass", () => {
  const p = prog({ career_stage: stated({ levels: ["bachelors", "masters"], min_year: null, max_year: null, must_be_currently_enrolled: null }) });
  assert.equal(get(evaluate(p, me({ degree_level: "masters", year_of_study: null })), "Career stage").result, "pass");
});

test("R-ELG-3 row 14: bounds exist, year unknown -> unknown (not fail)", () => {
  const p = prog({ career_stage: stated({ levels: ["bachelors"], min_year: 2, max_year: 3, must_be_currently_enrolled: null }) });
  const v = evaluate(p, me({ year_of_study: null }));
  assert.equal(get(v, "Career stage").result, "unknown");
  assert.equal(v.verdict, "unclear");
});

test("R-ELG-3 row 15: institution in_countries [US] vs studying in India -> fail", () => {
  const v = evaluate(prog({ institution: stated({ rule: "in_countries", countries: ["United States"] }) }), me());
  assert.equal(get(v, "Institution").result, "fail");
  assert.equal(v.verdict, "not_eligible");
});

test("R-ELG-2 row 16: group EU, citizen of Germany -> pass", () => {
  const v = evaluate(prog(cit("listed_countries", ["EU"])), me({ citizenships: ["Germany"] }));
  assert.equal(get(v, "Citizenship").result, "pass");
});

test("R-ELG-2 row 17: group Commonwealth, citizen India -> unknown, never fail", () => {
  const v = evaluate(prog(cit("listed_countries", ["Commonwealth"])), me());
  assert.equal(get(v, "Citizenship").result, "unknown");
  assert.equal(v.verdict, "unclear");
});

test("R-ELG-1 row 18: programme lists 'Indian', profile says 'India' -> match", () => {
  assert.equal(get(evaluate(prog(cit("listed_countries", ["Indian"])), me()), "Citizenship").result, "pass");
});

test("R-ELG-5 row 19: GPA 8.2/10 vs min 3.0/4.0 passes; 7.0/10 fails softly, verdict unchanged", () => {
  const p = prog({ min_gpa: stated({ value: 3.0, scale: 4 }) });
  const ok = evaluate(p, me({ gpa: { value: 8.2, scale: 10 } }));
  assert.equal(get(ok, "GPA").result, "pass");
  const low = evaluate(p, me({ gpa: { value: 7.0, scale: 10 } }));
  assert.equal(get(low, "GPA").result, "fail");
  assert.equal(low.verdict, "eligible");
  assert.equal(get(low, "GPA").hard, false);
});

test("R-ELG-7 row 20: other_requirements are listed, never evaluated, verdict unaffected", () => {
  const v = evaluate(prog({ other_requirements: stated(["IELTS 7.0", "Nomination letter"]) }), me());
  assert.equal(v.verdict, "eligible");
  const o = get(v, "Other requirements");
  assert.equal(o.result, "unknown");
  assert.match(o.reason, /IELTS 7.0/);
});

// ---- extra rules ----
test("R-ELG-3 the user's missing profile data gives unknown, not a guess", () => {
  const v = evaluate(prog(cit("citizens_only", ["India"])), me({ citizenships: [] }));
  assert.equal(get(v, "Citizenship").result, "unknown");
});

test("R-ELG-6 summary names the deciding hard check", () => {
  const v = evaluate(prog({ career_stage: stated({ levels: ["phd"], min_year: null, max_year: null, must_be_currently_enrolled: null }) }), me());
  assert.match(v.summary, /^Not eligible: the programme is for phd students \(you are bachelors\)\.$/);
});

test("R-ELG-5 fields of study: no overlap is a warning only", () => {
  const v = evaluate(prog({ fields_of_study: stated(["biology"]) }), me({ fields_of_study: ["physics"] }));
  assert.equal(get(v, "Field of study").result, "fail");
  assert.equal(v.verdict, "eligible");
});

test("R-ELG-5 must_be_currently_enrolled shows as an also-check", () => {
  const p = prog({ career_stage: stated({ levels: ["bachelors"], min_year: null, max_year: null, must_be_currently_enrolled: true }) });
  assert.ok(get(evaluate(p, me()), "Enrolment"));
});

test("Mitacs-style: listed_countries without India -> not eligible; with India -> eligible", () => {
  const without = prog(cit("listed_countries", ["Australia", "Brazil", "China", "United States"]));
  assert.equal(evaluate(without, me()).verdict, "not_eligible");
  const withIndia = prog(cit("listed_countries", ["Australia", "India", "Brazil"]));
  assert.equal(evaluate(withIndia, me()).verdict, "eligible");
});
