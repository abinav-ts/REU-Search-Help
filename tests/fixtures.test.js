import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluate } from "../docs/js/eligibility.js";
import { conforms, FIELD_TABLE, MENTORS_SCHEMA } from "../worker/src/schema.js";

const load = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/program-${n}.json`, import.meta.url), "utf8"));
const india = { citizenships: ["India"], permanent_residency: [], institution_country: "India", degree_level: "bachelors", year_of_study: 3, gpa: null, fields_of_study: [], interests: [], skills: [] };
const NAMES = ["mitacs", "cmu-suami", "iitgn-srip", "unt-nsf-reu", "eth-ssrf"];

for (const n of NAMES) {
  test(`${n}: saved extraction obeys the Program schema and the evidence rules (H1, H2)`, () => {
    const p = load(n);
    assert.equal(p.schema_version, 1);
    for (const [group, fields] of Object.entries(FIELD_TABLE)) {
      for (const [k, vs] of Object.entries(fields)) {
        const f = p[group][k];
        assert.ok(["stated", "ambiguous", "not_found"].includes(f.status), `${group}.${k} status`);
        if (f.status === "not_found") {
          // U5: a not_found field carries no value, quote or link
          assert.deepEqual([f.value, f.evidence, f.source_url], [null, null, null], `${group}.${k} should be empty`);
        } else {
          assert.ok(conforms(vs, f.value), `${group}.${k} value shape`);
          assert.ok(f.evidence && f.evidence.length <= 480, `${group}.${k} needs a quote`);
          assert.equal(typeof f.evidence_verified, "boolean", `${group}.${k} verified flag`);
          if (f.status === "stated") assert.equal(f.evidence_verified, true, `${group}.${k} stated means verified`);
        }
      }
    }
    if (p.mentors.status !== "not_found") assert.ok(conforms(MENTORS_SCHEMA, p.mentors.value));
    assert.ok(p.meta.pages_read.length >= 1 && p.meta.fetched_at);
  });
}

test("G1/A2 the NSF REU restricted to US citizens/PR is NOT ELIGIBLE for an Indian-citizen profile, with the deciding quote", () => {
  const v = evaluate(load("unt-nsf-reu"), india);
  assert.equal(v.verdict, "not_eligible");
  const c = v.checks.find((x) => x.criterion === "Citizenship");
  assert.equal(c.result, "fail");
  assert.match(c.evidence, /U\.S\. citizens, U\.S\. nationals, or U\.S\. permanent residents/);
  assert.match(c.source_url, /^https:\/\/cos\.unt\.edu\//);
  // ...but eligible for a US citizen at the right stage
  assert.equal(evaluate(load("unt-nsf-reu"), { ...india, citizenships: ["United States"], institution_country: "United States" }).verdict, "eligible");
});

test("ETH SSRF ('open to all students worldwide') passes citizenship for an Indian-citizen bachelor's student", () => {
  const v = evaluate(load("eth-ssrf"), india);
  assert.equal(v.checks.find((x) => x.criterion === "Citizenship").result, "pass");
});

test("F7 Mitacs: two pages with different country lists -> citizenship is ambiguous -> Unclear, both quotes kept", () => {
  const p = load("mitacs");
  assert.equal(p.eligibility.citizenship.status, "ambiguous");
  assert.ok(p.eligibility.citizenship.evidence.includes("‖"));
  assert.equal(evaluate(p, india).verdict, "unclear");
});
