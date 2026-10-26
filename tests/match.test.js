import test from "node:test";
import assert from "node:assert/strict";
import { keywordOverlap, tokens } from "../docs/js/match.js";

test("R-MAT-4 keyword overlap pairs related items and ignores filler words", () => {
  const r = keywordOverlap(
    { fields_of_study: ["physics"], interests: ["liquid crystals", "numerical PDEs"], skills: ["Python"], research_experience: [] },
    { research_areas: ["Liquid crystals", "Graph theory"], fields_of_study: ["Applied Mathematics"], problem_statement: "Numerical PDE methods for materials.", mentor_areas: [] }
  );
  assert.ok(r.shared.some((p) => p.yours === "liquid crystals" && p.theirs === "Liquid crystals"));
  assert.ok(r.shared.some((p) => p.yours === "numerical PDEs"));
  assert.ok(!r.shared.some((p) => p.yours === "Python"));
  assert.ok(["moderate", "strong"].includes(r.fit));
});

test("R-MAT-3 no programme data -> unknown", () => {
  assert.equal(keywordOverlap({ interests: ["x y z"] }, { research_areas: [], fields_of_study: [], problem_statement: "" }).fit, "unknown");
});

test("tokens drops stop words and trailing plurals", () => {
  assert.deepEqual(tokens("Research in crystals and graphs"), ["crystal", "graph"]);
});
