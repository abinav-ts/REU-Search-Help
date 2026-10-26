# Progress

Tick a box only when its exit test has passed on the **deployed** site (or Worker), not only locally.

## M0 Walking skeleton (Mon 10:00–11:00) — spec 05
- [x] GitHub repo exists; Pages serves `docs/index.html` at a public URL (https://abinav-ts.github.io/REU-Search-Help/)
- [x] Worker deployed; `GET /api/health` returns `{ok:true}` (https://reu-brief.abinav-ts2006.workers.dev)
- [x] Page button calls the Worker from the Pages origin (CORS works) and shows the reply (checked on phone, 26 Oct ~13:00 IST)
- [x] Smoke test for Gemini and Firecrawl; Flash model ids chosen and set as `MODEL_PUBLIC` (`gemini-3.1-flash-lite,gemini-3.5-flash-lite`); Workers AI model set as `MODEL_PRIVATE` (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Gemini checked on the deployed Worker via `/api/diag/gemini` (26 Oct): 3.1 got 503 then stalled, fallback 3.5 answered 200 in 20.7 s. Firecrawl checked the previous session (`/v2/search`).
- [x] `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `DEMO_KEY` set as Worker secrets
- Exit test: open the Pages URL on your phone, press the button, see the Worker reply.

## M1 Vertical slice (11:00–13:00) — specs 01, 02
- [ ] `/api/resolve` returns candidates for 3 clean names
- [ ] `/api/extract` returns core fields (name, eligibility.citizenship, application counts, deadline) for 3 programs
- [ ] Raw JSON visible on the page
- Exit test: 3 real programs, each core field matches the real page, evidence quotes present.

## M2 Full extraction (13:45–16:00) — spec 02
- [ ] Full schema validated in Worker (R-EXT-*)
- [ ] Evidence verification downgrades unverifiable fields
- [ ] PDF page handled; JS-rendered page read; login-walled page returns `blocked`
- [ ] KV cache + `refresh`
- [ ] Paste-text fallback endpoint path
- Exit test: acceptance A1-A8 in spec 02.

## M3 Eligibility engine (16:15–18:00) — specs 03, 04 (form)
- [ ] `docs/js/eligibility.js` pure functions
- [ ] `node --test` passes the truth table in spec 03
- [ ] Profile form wired to verdict on live data
- Exit test: citizenship-restricted program shows Not eligible for an Indian-citizen profile, with the quote.

## GATE G1 (Mon 18:00)
- [ ] Public URL → type a program → verdict + sources. If not, apply the cut ladder in `SCHEDULE.md`.

## M4 Result page + UX (19:00–21:15) — spec 06
- [ ] Progress stream messages
- [ ] Disambiguation picker and "Is this the program you meant?" chip
- [ ] Result layout complete, "Not stated on the site" shown in grey
- [ ] Error states for every code in spec 05 §6
- Exit test: spec 06 acceptance U1-U8, on desktop and phone.

## M5 CV + match (21:30–23:00) — spec 04
- [ ] `/api/profile` parses a PDF CV, prefills form, user confirms
- [ ] `/api/match` returns shared fields
- [ ] CV never stored or logged (check Worker logs); no user-derived text reaches Gemini (test B8)
- Exit test: spec 04 acceptance P1-P6.

## M6 Hardening (Tue 08:00–10:15) — spec 07
- [ ] 8-query demo set run; every row meets its expected outcome
- [ ] Failure list F1-F12 each has a test or manual check logged

## M7 Rehearse + submit (10:30–11:30) — spec 07
- [ ] Two clean runs on phone hotspot
- [ ] Cache pre-warmed for the demo set
- [ ] Backup screen recording saved
- [ ] README written, submission links ready

## Notes for next session (state as of Mon 26 Oct, ~19:00 IST)

**M0 is done.** Site: https://abinav-ts.github.io/REU-Search-Help/ . Worker: https://reu-brief.abinav-ts2006.workers.dev . Next: M1 (specs 01, 02). `SCHEDULE.md` still needs re-cutting for the late start (cut-ladder steps 1-2 up front; keep sleep 23:30-07:00).

**Working pattern.** Keys live in Worker secrets (set by the owner in a real Terminal; `!` runs without a keyboard, so `wrangler secret put` must not be run that way) and in git-ignored `worker/.dev.vars` (owner-written; Claude never reads it). Claude runs `npx wrangler dev` and curls `localhost:8787` with `X-Demo-Key: local-test`. Claude does not know the real `DEMO_KEY`; the page's "Check Gemini" button is the owner's way to test the deployed Worker.

**Gemini facts measured (26 Oct)**
- Rate limits are per Google project, not per key. This app has its own project.
- `gemini-2.5-flash`: 404 for new keys. `gemini-3.8-flash`: times out (>45 s; the sister project saw ~206 s per call, 20 requests/day), so not on the live path.
- `gemini-3.1-flash-lite`: 2 s to 16 s on a trivial prompt, and one 503 followed by a 30 s stall. `gemini-3.5-flash-lite`: 20-26 s even on a trivial prompt, but the sister project got 15 rpm / 500 rpd and good extraction quality from it.
- Plan for M1: expect 20+ s per Gemini call; show progress; set the call timeout per spec 05 (60 s) and measure on a real page before tightening. Request shape in `worker/src/providers/gemini.js` (`responseJsonSchema`; optional `thinkingConfig.thinkingLevel`, untested).
- Gemini 503 and quota errors are expected; build the fallback list handling (R-BE-12) properly in M1 (`/api/diag/gemini` already walks it).

**Spec changes today:** new fields (other_funding, travel_support, housing, visa_support, optional prior_year_selectivity), full schema built in M1 (R-EXT-15); `/diag/gemini` endpoint. See the decision log in `specs/00-global.md` §12.
