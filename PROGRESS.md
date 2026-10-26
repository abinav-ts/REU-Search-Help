# Progress

Tick a box only when its exit test has passed on the **deployed** site (or Worker), not only locally.

## M0 Walking skeleton (Mon 10:00–11:00) — spec 05
- [x] GitHub repo exists; Pages serves `docs/index.html` at a public URL (https://abinav-ts.github.io/REU-Search-Help/)
- [x] Worker deployed; `GET /api/health` returns `{ok:true}` (https://reu-brief.abinav-ts2006.workers.dev)
- [x] Page button calls the Worker from the Pages origin (CORS works) and shows the reply (checked on phone, 26 Oct ~13:00 IST)
- [x] Smoke test for Gemini and Firecrawl; Flash model ids chosen and set as `MODEL_PUBLIC` (`gemini-3.1-flash-lite,gemini-3.5-flash-lite`); Workers AI model set as `MODEL_PRIVATE` (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Gemini checked on the deployed Worker via `/api/diag/gemini` (26 Oct): 3.1 got 503 then stalled, fallback 3.5 answered 200 in 20.7 s. Firecrawl checked the previous session (`/v2/search`).
- [x] `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `DEMO_KEY` set as Worker secrets
- Exit test: open the Pages URL on your phone, press the button, see the Worker reply.

## M1 Vertical slice — specs 01, 02
Built and tested locally on 27 Oct (not yet deployed, so not ticked). "Local" = `node --test`, `scripts/local.mjs`, real Gemini.
- [ ] `/api/resolve` returns candidates for 3 clean names — local: logic + real Gemini on canned search results (SURF IIT Gandhinagar → SRIP with a name-difference reason; invented programme → refusal). **Needs a run with real Firecrawl search.**
- [ ] `/api/extract` returns core fields for 3 programmes — local, real Gemini, pages read over plain HTTP (stand-in for Firecrawl): Mitacs Globalink, CMU SUAMI, IITGN SRIP (+ UNT NSF-REU, ETH SSRF). **Needs a run with real Firecrawl (JS rendering, PDFs).**
- [ ] Raw JSON visible on the page — superseded by the real result page (M4); the raw record is in the Worker reply.
- Exit test: 3 real programmes, each core field matches the real page, evidence quotes present — **owner to check by eye** against the live pages (fixtures in `tests/fixtures/program-*.json`).

## M2 Full extraction — spec 02
- [x] Full schema validated in Worker (`schema.js`: one table drives the model schema, shape checks and clean-up) — tests
- [x] Evidence verification downgrades unverifiable fields (R-EXT-9) — tests + fixtures
- [ ] PDF page handled; JS-rendered page read; login-walled page returns `blocked` — code paths exist; **needs real Firecrawl** (the stand-in cannot read PDFs or run JavaScript)
- [x] KV cache + `refresh` (local fake KV; real KV on deploy)
- [x] Paste-text fallback endpoint path (+ page UI)
- Acceptance A1–A8 (spec 02): A2, A3, A7, A8 pass locally (A8 via `scripts/check-injection.mjs`); A1 owner-by-eye; A4 covered by code-side conflict detection (Mitacs); A5, A6 need real Firecrawl.

## M3 Eligibility engine — specs 03, 04 (form)
- [x] `docs/js/eligibility.js` pure functions
- [x] `node --test` passes the truth table in spec 03 (all 20 rows) — `tests/eligibility.test.js`
- [ ] Profile form wired to verdict on live data — wired and tested in a fake browser; **needs the deployed site**
- Exit test: citizenship-restricted programme shows Not eligible for an Indian-citizen profile, with the quote — **passes on a saved real extraction** (UNT NSF-REU, `tests/fixtures.test.js`); not yet seen live.

## GATE G1
- [ ] Public URL → type a programme → verdict + sources. Everything needed is built; **blocked on deploy** (see "To do next").

## M4 Result page + UX — spec 06
- [x] Progress stream messages (stage events; elapsed timer; cancel)
- [x] Disambiguation picker and "Is this the programme you meant?" chip
- [x] Result layout complete, "Not stated on the site" shown in grey, optional selectivity hidden when absent
- [x] Error states for every code in spec 05 §6 (+ `network`) — fake-browser test
- [ ] Spec 06 acceptance U1–U8 on desktop and phone — U3, U5, U6, U7, U8-ish and R-UI-7 pass in the fake browser; **U1, U2, U4 visual and phone checks are for the owner** (no real browser could run in the agent sandbox)

## M5 CV + match — spec 04
- [x] `/api/profile` parses CV text (private lane); PDF read in the browser (pdf.js 4.10.38 from cdnjs); prefills the form, user confirms — **untested against real Workers AI** (no AI binding off Cloudflare) and real pdf.js; tested with fakes
- [x] `/api/match` returns shared fields, pairs verified in code; keyword fallback in the browser
- [x] CV never stored or logged; no user-derived text reaches Gemini (tests P5, P7, B8)
- [ ] Spec 04 acceptance P1–P6 on the deployed site (P1, P2, P4, P5, P7 pass with fakes)

## M6 Hardening — spec 07
- [ ] 8-query demo set run; every row meets its expected outcome — **owner + real Firecrawl.** Suggested set (all but #3, #4 tested in some form): 1 `SURF at IIT Gandhinagar` (→ SRIP), 2 `Mitacs Globalink Research Internship`, 3 a forum link or loose description, 4 `SURF` alone (ambiguous), 5 UNT Chemistry NSF-REU `https://cos.unt.edu/chemistry/nsf-reu-program/application.html` (US-only → Not eligible), 6 IITGN SRIP brochure PDF, 7 `CMU SUAMI` (last cycle's page), 8 `Zorblax Quantum Fellowship 2027`
- [ ] Failure list F1–F12: F1, F7, F9 (injection), F11? (no), F12 partly (rate limit, quota errors) have tests; F2–F6, F8, F10 need live checks

## M7 Rehearse + submit — spec 07
- [ ] Two clean runs on phone hotspot
- [ ] Cache pre-warmed for the demo set (`worker/scripts/prewarm.mjs`)
- [ ] Backup screen recording saved
- [ ] README written (done) , submission links ready

## To do next (owner), in this order
1. **Deploy the Worker, then push.** Deploying first matters: the new page calls endpoints the old Worker does not have. In Terminal: `cd ~/Projects/REU-Search-Help/worker && npx wrangler deploy`, then `cd .. && git push`. (Pages updates about a minute after the push.)
2. Open the site, enter the demo key, tap the example chips. Report anything that looks wrong or takes more than ~90 s.
3. Add the Firecrawl key to `worker/.dev.vars` if you want Claude to run real-Firecrawl checks locally (do it with the `read -s` pattern; never paste keys in chat).
4. Check each fixture in `tests/fixtures/` against its real page (M1 exit test), especially deadlines and citizenship.
5. Pre-warm the cache once the demo queries behave: `DEMO_KEY=... node worker/scripts/prewarm.mjs https://reu-brief.abinav-ts2006.workers.dev "Mitacs Globalink Research Internship" "CMU SUAMI" ...`

## Notes (state as of Tue 27 Oct, ~05:00 IST)

**Working pattern.** Keys live in Worker secrets (set by the owner in a real Terminal) and in the git-ignored `worker/.dev.vars` (owner-written; Claude never reads it). The agent shell cannot open local ports, run Chrome, or reach `~/Library`, so: Worker runs through `scripts/local.mjs`, the page is tested in jsdom (`scripts/dom-smoke.mjs`), and nothing here could be deployed or pushed from the agent.

**Known weak spots (be honest in the demo)**
- Free lite models are weaker than frontier ones. Code compensates (quote checks, conflict detection, `any` guard) but extraction can still miss facts: it errs toward `not_found`/`ambiguous`, which the UI shows plainly.
- Gemini latency is 2–60 s per call and 503s are normal; the model list falls back automatically. A cached lookup is instant.
- Workers Free allows ~10 ms CPU per request. The verification code was measured at a few ms in Node, but real Workers timing is untested. If a deployed lookup fails with Cloudflare error 1102, that is the cause (see `docs` in the decision log).
- Real Firecrawl output (markdown from `onlyMainContent`, PDF text) differs from the plain-HTTP stand-in used in testing, so link ranking and extraction need one pass of live checking.
- Deadlines that the page gives without a year come back `ambiguous`; a past programme page (CMU SUAMI 2026) shows `Dates unclear` rather than `Closed`.
- `gemini-3.8-flash` is not in the live path (times out); `thinkingConfig` was never tested.

**Gemini facts (measured 26 Oct).** Rate limits are per Google project. `gemini-2.5-flash`: 404 for new keys. `gemini-3.8-flash`: > 45 s. `gemini-3.1-flash-lite`: 2–16 s with occasional 503 and stalls; `gemini-3.5-flash-lite`: 20–26 s for trivial prompts but 8–40 s on real pages. See decision log.
