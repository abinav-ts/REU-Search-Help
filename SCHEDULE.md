# Schedule — REU Brief

> **Re-cut, Tue 27 Oct ~05:00 IST.** The window ends **Tue 11:59 IST**. M0–M5 were built (locally) overnight; what remains is deploy, live checks and the demo. Plan from here: 07:00–08:00 owner wakes, deploys and pushes (`PROGRESS.md` "To do next"); 08:00–10:15 M6 hardening on the live site (demo set, failure list, fixes); 10:15–10:30 break; 10:30–11:30 M7 rehearse, pre-warm the cache, record the backup video; 11:30–11:59 freeze. Cut-ladder steps 1–2 (mentor depth, tier filters) were applied up front: mentors are names with affiliation/area, and tier/country are labels only. Gate G1 is the first thing to check after the deploy.


Window: **Mon 26 Oct 2026, 10:00 IST → Tue 27 Oct 2026, 11:59 IST** (25 h 59 m wall-clock).

## Assumptions (change these and the plan must be re-cut)

1. "Tomorrow 10:00" means **Monday 26 Oct** (the plan was written in the early hours of Monday).
2. Sleep is **23:30 → 07:00 (7.5 h)**, with a half-hour wind-down before and an hour to get going after.
3. Real build time is therefore **about 14 h**, not the 24-30 h first estimated. The scope in `specs/00-global.md` is cut to fit. Claude Code writes most of the code; your time goes on accounts, testing real programs, and judging whether extracted facts are correct.
4. The free-tier stack (Firecrawl + Gemini + Workers AI) means our own Worker code runs the search→read→extract steps. That adds about an hour of Worker code compared with using a paid model's built-in search tools; it is absorbed in M1-M2 and, if needed, by cutting mentor depth first.
5. The other course project (ExpRes) is assumed to need **no hands-on time** during this window. If it does, tell Claude and the blocks below get re-cut around it (Gate G1 is the thing to protect).

## Pre-flight (optional, tonight, 20 min — saves M0 time)

- Accounts already done: GitHub, Cloudflare, Google AI Studio key, Firecrawl account.
- Create the public GitHub repo `reu-brief` (public is needed for free Pages) and put this folder's contents in it.
- Get your Firecrawl API key from its dashboard. Then, in your own terminal, run `scripts/smoke-test.sh` (the keys go in your shell with `export`, never into a file or this chat). It confirms both keys work and lists the Flash models your Gemini key can use.

## Timetable

| Time | Block | What | Specs |
|---|---|---|---|
| **Mon 10:00–11:00** | **M0** Walking skeleton | Repo, Pages site live, Worker deployed, browser → Worker → reply, secrets set | 05 |
| **11:00–13:00** | **M1** Vertical slice | Provider wrappers (Firecrawl, Gemini), then program name → resolve → extract → raw JSON on screen | 01, 02 (core fields), 05 |
| 13:00–13:45 | Lunch | | |
| **13:45–16:00** | **M2** Full extraction | Full schema, evidence + status per field, multi-page and PDF, evidence verification, cache, paste-text fallback | 02 |
| 16:00–16:15 | Break | | |
| **16:15–18:00** | **M3** Eligibility engine | Profile form, pure-code verdict, unit tests | 03, 04 (form only) |
| **18:00** | **GATE G1** | *Shippable core*: public URL, real lookup, code-based verdict. Everything after is upside. | |
| 18:00–19:00 | Dinner | | |
| **19:00–21:15** | **M4** Result page + UX | Progress stream, disambiguation, result layout, error states | 06 |
| 21:15–21:30 | Break | | |
| **21:30–23:00** | **M5** CV + match | CV upload → prefilled profile, shared-fields match | 04 |
| 23:00–23:30 | Wind-down | Commit, push, deploy, write tomorrow's first task in `PROGRESS.md` | |
| **23:30–07:00** | **Sleep** | 7.5 h | |
| 07:00–08:00 | Wake, breakfast | | |
| **Tue 08:00–10:15** | **M6** Hardening | Run the 8-query demo set, fix the failure list | 07 |
| 10:15–10:30 | Break | | |
| **10:30–11:30** | **M7** Rehearse + submit | Two full runs from a clean browser on phone hotspot, pre-warm cache, record backup video, README | 07 |
| **11:30–11:59** | **Freeze** | Only revert-level fixes. Submit. | |

Build hours: 1 + 2 + 2.25 + 1.75 + 2.25 + 1.5 + 2.25 + 1 = **14 h**, plus 29 min freeze.

## Who does what

| Block | You | Claude Code / Claude |
|---|---|---|
| M0 | `wrangler login`, run `wrangler secret put` three times (Firecrawl, Gemini, demo key), enable Pages | Scaffolding, Worker hello, CORS, deploy commands |
| M1-M2 | Pick 6-8 real programs to test; judge extracted facts against the real pages | Resolve, gather, extract, cache |
| M3 | Decide edge-case rules when a program's wording is odd | Eligibility engine + tests |
| M4 | Click through on desktop and phone, report what feels broken | UI |
| M5 | Provide your real CV (kept out of the repo) | CV parse + match |
| M6-M7 | Run the demo set, rehearse, record video | Fixes |

## Gates and cut ladder

**G1 (Mon 18:00).** If M0-M3 are not done: stop adding anything, finish M3 in the dinner hour, and skip M5 entirely (profile form only, no CV upload).

**Cut ladder, in this order, when behind:**

1. Mentor extraction depth → names only.
2. Tier and country filters → shown as a label on the result, no filtering.
3. LLM shared-fields match → plain keyword overlap.
4. CV upload → profile form only (the CV step becomes "paste your interests").
5. Paste-text fallback.

**Never cut:** evidence + status on every field, code-based eligibility, the "no such program" refusal, live progress messages, the cache fallback for demo day.

## Checkpoints for the schedule itself

- Each block ends with its exit test (in `PROGRESS.md`). If a block overruns by more than 30 min, cut from the ladder instead of eating sleep.
- Do not trade sleep for scope. Tuesday morning is for fixing, and a rested hour beats two tired ones.
