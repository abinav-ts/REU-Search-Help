# Progress

Tick a box only when its exit test has passed on the **deployed** site (or Worker), not only locally.

## M0 Walking skeleton (Mon 10:00–11:00) — spec 05
- [x] GitHub repo exists; Pages serves `docs/index.html` at a public URL (https://abinav-ts.github.io/REU-Search-Help/)
- [x] Worker deployed; `GET /api/health` returns `{ok:true}` (https://reu-brief.abinav-ts2006.workers.dev)
- [x] Page button calls the Worker from the Pages origin (CORS works) and shows the reply (checked on phone, 26 Oct ~13:00 IST)
- [ ] `scripts/smoke-test.sh` passes for Gemini and Firecrawl; Flash model id chosen and set as `MODEL_PUBLIC`; Workers AI model id set as `MODEL_PRIVATE`
- [ ] `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `DEMO_KEY` set as Worker secrets (`DEMO_KEY` and `FIRECRAWL_API_KEY` done; `GEMINI_API_KEY` waiting for the new AI Studio key)
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

## Notes for next session (state as of Mon 26 Oct, 12:15 IST)

**Timing:** the build started about 1h40 late (M0 should have ended 11:00). Everything below the schedule is shifted by roughly that much. First task: re-cut `SCHEDULE.md` with the remaining time to Tue 11:59 (keep sleep 23:30-07:00), applying cut-ladder steps 1-2 (mentor depth, tier filters) up front. Gate G1 moves to about 19:30.

**M0 status**
- Written: `worker/src/index.js` (health, CORS, demo-key check, `/api/ping`), `worker/wrangler.toml` (placeholders), `docs/index.html` + `docs/js/app.js` + `docs/js/config.js` (ping page), `.gitignore`, `scripts/smoke-test.sh` (now with a 40 s timeout and timing).
- Not done yet (owner runs these in Terminal, Claude Code guides): `npx wrangler login`; `npx wrangler kv namespace create CACHE` and paste the printed block into `wrangler.toml`; set `ALLOWED_ORIGIN` (needs the owner's GitHub username) and `WORKER_URL` in `docs/js/config.js`; `npx wrangler secret put` for `DEMO_KEY`, `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`; `npx wrangler deploy`; create the GitHub repo and enable Pages (`main` → `/docs`).
- Do not ask the owner to paste any key into chat or into a file.

**Provider checks**
- Firecrawl: verified. `POST https://api.firecrawl.dev/v2/search` works; results at `data.web[]` (url, title, description, position).
- Gemini: key lists models fine. The shared free-tier daily quota was used up yesterday (likely by the other course project on the same Google project). Owner will make a **new key in a new AI Studio project** for this app; the quota resets at 12:30 IST. A call to `gemini-3.6-flash` ran too long (duration unknown, likely a slow model or demand spike); a `503 UNAVAILABLE` was seen on another attempt. Still to test: `gemini-3.8-flash` and a flash-lite model, using the timer in the smoke test. Result decides `MODEL_PUBLIC` (a comma-separated fallback list, spec 05) and whether to turn thinking down for JSON calls.
- Workers AI model for `MODEL_PRIVATE`: not chosen yet (needs an instruct model that supports JSON output).
- Gemini 503 and quota errors are expected; build the fallback list and `quota_exhausted` handling (R-BE-12) early, in M1.
