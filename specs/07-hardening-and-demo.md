# 07 — Hardening and demo

Depends on: everything. Used in M6 (Tue 08:00) and M7 (Tue 10:30).

## 1. Failure list (each needs a test or a logged manual check)

| ID | Failure | Expected behaviour | Where |
|---|---|---|---|
| F1 | Invented programme | Refusal, no URLs invented | 01 R-RES-4/8 |
| F2 | Reddit/aggregator only | Name recovered, or `aggregator_only` | 01 R-RES-1/7 |
| F3 | Ambiguous acronym | Pick-list | 01 R-RES-5 |
| F4 | JavaScript-rendered page | Read via Firecrawl; if still empty → `js_required` + paste-text path | 02 R-EXT-4/12 |
| F5 | Login/captcha wall | `blocked` with advice | 02 R-EXT-4 |
| F6 | Info spread over pages / PDF | Multiple pages in `pages_read` | 02 R-EXT-2/3 |
| F7 | Contradicting pages | `ambiguous` with both quotes | 02 R-EXT-7 |
| F8 | Last year's cycle / passed deadline | Stale warning, `closed` chip | 02 R-EXT-10 |
| F9 | Prompt injection in page or CV | No change to output | 02 A8, 04 P4 |
| F10 | Slow response / dropped connection | Progress, timeout message, retry | 05 R-BE-6, 06 R-UI-7 |
| F11 | Non-English page | Extracted, language noted | 02 R-EXT-13 |
| F12 | Rate limit, Firecrawl credits or Gemini quota exhausted | `quota_exhausted` / `rate_limited` message, cached examples still work | 05 R-BE-4/11/12 |

## 2. Latency budget (targets, not promises)
Resolve ≤ 15 s; extract ≤ 60 s; cache hit ≤ 2 s. If a live lookup exceeds 90 s the UI offers the cached example.

## 3. The 8-query demo set (fill the "Query" column on Mon evening; the owner verifies each against the real page)

| # | Category | Query (confirm real examples) | Expected |
|---|---|---|---|
| 1 | Clean, open to Indian students | e.g. an Indian national summer fellowship (IAS / JNCASR / TIFR-type) | Eligible or Unclear with full details |
| 2 | Clean, foreign, open to Indian students | e.g. DAAD WISE-type | Details + verdict |
| 3 | Reddit-style vague name | a loose description or a forum URL | Resolves to correct programme |
| 4 | Ambiguous name | an acronym used by several programmes | Pick-list |
| 5 | Citizenship-restricted | an NSF REU site limited to US citizens/PR | **Not eligible** + quote |
| 6 | PDF-based page | a programme whose rules are in a brochure PDF | Fields with `kind: pdf` |
| 7 | Closed / previous cycle | a programme whose page shows last year's dates | Stale warning |
| 8 | Nonexistent | "Zorblax Quantum Fellowship 2027" | Refusal |

Rows 1, 2, 5, 6, 7 are pre-warmed into the cache (R-BE-9). Rows 3, 4, 8 run live to show resolve behaviour. Say plainly in the demo that the cache exists and why.

## 4. Demo script (≈ 4 min)
1. 20 s — the problem: "Open the REU page, read 10 minutes, discover US citizens only."
2. 30 s — profile (pre-filled Indian-citizen profile); upload CV (P1) and show what it filled.
3. 60 s — row 5 live-ish: Not eligible with the quote; click source link to prove it.
4. 60 s — row 1 or 2: one-page brief, shared fields, SOP/recs count, mentors.
5. 30 s — row 3 vague Reddit name → resolves.
6. 30 s — row 8: refusal. "It doesn't make things up."
7. 30 s — architecture in one sentence + honesty rules (evidence, code verdict).

## 5. Rehearsal checklist (M7)
- Two complete runs from a fresh browser profile, on phone hotspot, laptop on battery saver off.
- Demo key typed correctly; `localStorage` profile cleared before the run, then re-entered on stage.
- Backup: 3-minute screen recording of a perfect run, saved locally and uploaded.
- Firecrawl credits and Gemini quota checked (`/health` shows credits used); cache pre-warm confirmed by running each demo row once and seeing `from_cache`.
- Freeze rule from 11:30: no new features; only revert to the last working deploy.

## 6. README outline (for submission)
What it does, live URL, architecture diagram (from 00 §5), how specs drove the build (list of files), honesty rules, known limits (JS-only sites, programme terms change, not legal advice), how to run locally.
