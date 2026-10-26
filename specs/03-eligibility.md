# 03 — Eligibility engine (pure code, runs in the browser)

Depends on: 02 (Program record), 04 (Profile). File: `docs/js/eligibility.js`. Tests: `tests/eligibility.test.js`.

## Purpose
Compare one user profile to one programme record and return **Eligible / Not eligible / Unclear**, with the reasons and the quotes that decided it. No model is involved (H3).

## Profile (inputs)
```
Profile = {
  citizenships: string[],            // canonical English country names; required, ≥ 1
  permanent_residency: string[],     // countries where the user holds PR; may be empty
  institution_country: string,       // where the user currently studies; required
  degree_level: "bachelors"|"masters"|"phd"|"other",   // required
  year_of_study: number | null,      // 1-based within the degree
  gpa: { value: number, scale: number } | null,
  fields_of_study: string[], interests: string[], skills: string[]
}
```

## Output
```
Verdict = {
  verdict: "eligible" | "not_eligible" | "unclear",
  summary: string,                         // one sentence built from templates, no model text
  checks: [{ criterion, result: "pass"|"fail"|"unknown"|"n/a", reason, evidence, source_url, hard: boolean }]
}
```

## Requirements
- **R-ELG-1** `normalizeCountry(name)` maps aliases to canonical names ("Indian", "IN", "Bharat" → "India"; "USA", "U.S.", "United States of America" → "United States"; "UK", "Britain" → "United Kingdom", etc.). Unknown names stay unchanged (never throw).
- **R-ELG-2** Groups expand through a small table: `EU`, `EEA`. Any other group name (e.g. "Commonwealth", "developing countries") → result `unknown`.
- **R-ELG-3** **Hard criteria** (can cause `not_eligible` when they fail): citizenship, career stage, institution. **Required-to-pass** (must be `pass` for `eligible`): citizenship and career stage only. Institution is often unstated, so an `unknown` institution adds an "also check" line but does not block `eligible`. **Soft criteria:** GPA, fields of study, other requirements.
- **R-ELG-4** A criterion is evaluated only when its field has `status: "stated"`. `ambiguous` or `not_found` → `unknown`, whatever the value.
- **R-ELG-5** Verdict:
  1. any hard criterion `fail` → `not_eligible`;
  2. else citizenship and career stage both `pass` (institution `pass` or `unknown`) → `eligible`;
  3. else → `unclear`.
  Soft criteria never change the verdict; a soft `fail` adds a warning line, a soft `unknown` adds an "also check" line.
- **R-ELG-6** `summary` is built from templates and states the *deciding* hard check, e.g. "Not eligible: the programme is open to citizens of United States only (you hold India)."
- **R-ELG-7** `other_requirements` are never evaluated; they appear as "also check" with their quotes.

## Evaluation tables

**Citizenship** (`rule`, `countries` normalised):

| rule | pass when | fail when | else |
|---|---|---|---|
| `any` | always | never | |
| `citizens_only` | user citizen of any listed country | user holds none of them | `countries` empty → unknown |
| `citizens_or_pr` | citizen of, or PR in, any listed country | neither | `countries` empty → unknown |
| `listed_countries` | any user citizenship in list | none in list | |
| `excludes_countries` | no user citizenship in list | any user citizenship in list | |
| `other` | — | — | always unknown |

**Career stage:** levels contain `degree_level` AND (`min_year`/`max_year` bounds, if present, contain `year_of_study`; if the user's `year_of_study` is null and bounds exist → unknown) Users are assumed to be currently enrolled, so `must_be_currently_enrolled` is ignored in the check and shown as "also check" when true. Level not in list → fail.

**Institution:** `any` → pass; `in_countries` → pass iff `institution_country` ∈ list else fail; `listed_institutions`, `other` → unknown.

**GPA (soft):** compare after rescaling to the programme's scale (`user.value / user.scale * programme.scale`); user GPA missing → unknown.

**Fields of study (soft):** case-insensitive overlap between user fields/interests and programme list; no overlap → warning, never fail.

## Truth table to turn into tests (minimum)
| # | Programme says | Profile | Expect |
|---|---|---|---|
| 1 | citizens_only [United States], quote present | citizen India | not_eligible |
| 2 | citizens_or_pr [United States] | citizen India, PR none | not_eligible |
| 3 | citizens_or_pr [United States] | citizen India, PR United States | eligible (if stage passes) |
| 4 | any | citizen India | citizenship pass |
| 5 | listed_countries [India, Nepal] | citizen India | pass |
| 6 | excludes_countries [India] | citizen India | fail → not_eligible |
| 7 | citizenship `ambiguous` | any | citizenship unknown → unclear |
| 8 | citizenship `not_found` | any | unknown → unclear |
| 9 | citizenship `stated` fail but other hard criteria unknown | | not_eligible (fail dominates) |
| 10 | citizenship + stage pass, GPA unknown | | eligible with "also check" |
| 10b | citizenship + stage pass, institution `not_found` | | eligible, institution listed under also-check |
| 10c | citizenship pass, career stage `not_found` | | unclear |
| 11 | levels [bachelors], min_year 2, max_year 3 | bachelors year 1 | stage fail |
| 12 | levels [bachelors] | masters | stage fail |
| 13 | levels [bachelors, masters] | masters year null, no bounds | pass |
| 14 | bounds exist, year null | | unknown |
| 15 | institution in_countries [United States] | institution India | fail |
| 16 | group "EU" | citizen Germany | pass |
| 17 | group "Commonwealth" | citizen India | unknown |
| 18 | alias "Indian" in programme list | citizen "India" | match |
| 19 | GPA 8.2/10 vs min 3.0/4.0 | | pass (3.28) ; 7.0/10 → 2.8 fail (soft, warning only) |
| 20 | `other_requirements` present | | listed as also-check, verdict unaffected |

## Acceptance
- **A1** `node --test` passes all rows above, named by `R-ELG-n` where applicable.
- **A2** On a live NSF-REU-style programme restricted to US citizens/PR, an Indian-citizen profile shows **Not eligible** with the deciding quote and source link.
- **A3** Changing the profile re-computes the verdict instantly in the browser without another lookup.
