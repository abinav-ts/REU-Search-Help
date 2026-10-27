# 00 — Global spec: REU Brief

Working title: **REU Brief**. Status: draft v2 (free-tier stack), Mon 26 Oct 2026. Sub-specs: 01 resolve, 02 extract, 03 eligibility, 04 profile + CV match, 05 backend, 06 frontend, 07 hardening + demo.

## 1. Problem

Finding a summer research programme (REU and equivalents) means opening many long websites to learn who may apply, what is being researched, what the application needs, and who the mentors are. For an applicant outside the US, many programmes turn out to be closed to them (citizenship rules), and that is only discovered after reading most of the page.

## 2. Product statement

The user types **any programme name, URL, or vague description** ("that quantum REU someone mentioned on Reddit"). REU Brief finds the official page, reads it, and returns **one page** with: an eligibility verdict for *this user*, the problem statement, fields shared between the programme and the user, number of SOPs and recommendation letters, mentors, deadline, and links to the source for every claim.

The product is the **live lookup**. It is not a curated database (a course constraint). A cache exists only to protect free-tier quotas and make repeat lookups and demos safe.

## 3. Core flow

1. User fills a short profile once (citizenship, degree level, year, institution country; optional GPA, interests, CV).
2. User types a query. → **Resolve** (spec 01) returns one confident programme, a short pick-list, or a refusal.
3. **Extract** (spec 02) reads the official page(s) and returns a structured record with evidence for every field.
4. **Eligibility** (spec 03, code, in the browser) compares the record to the profile.
5. **Match** (spec 04) lists shared fields with the CV-derived profile.
6. **Result page** (spec 06) shows everything, with progress shown while it runs.

## 4. Scope

**P0 (must exist for the demo):** resolve with disambiguation and refusal; extract with evidence and status per field; code-based eligibility verdict; result page; streamed progress; deployed on a public URL; demo-set cache.
**P1:** CV upload → profile prefill; shared-fields match; paste-text fallback; evidence verification (R-EXT-9); tier label.
**P2 (only if time, likely cut):** tier/country *filters*, mentor depth, "suggest programmes" discovery mode, saving past lookups.

**Non-goals:** accounts or login; a programme database; scraping at scale; guaranteeing a programme's current terms (always link to the official page); legal or visa advice; application tracking; any paid service.

## 5. Architecture

```
Browser (GitHub Pages, static HTML/JS; pdf.js reads CVs locally)
   │  HTTPS, Server-Sent Events, header X-Demo-Key
   ▼
Cloudflare Worker  /api/*      ← our code runs the whole pipeline
   ├─► Firecrawl   search + scrape (JS-rendering, PDFs → markdown)       public data only
   ├─► Gemini Flash (Google AI Studio, free tier)  resolve + extract     public page text only
   ├─► Workers AI (Cloudflare)   CV parsing + shared-fields match        anything user-derived
   └─► Workers KV   cache + monthly credit counter
```

- The Worker is plain code in a fixed sequence (search → choose → scrape → extract → verify). Models never call tools; they only read text we hand them and fill a fixed JSON schema.
- Eligibility and the user's profile live **in the browser**. Nationality and similar details are never sent to the Worker.
- The CV is read to text in the browser (pdf.js); only that text goes to the Worker, is parsed by Workers AI, and is discarded (spec 04).
- A static site cannot hold API keys. That is why the Worker exists; it is the only server-side code.

## 6. Stack (chosen for a first-time web builder; all free, no card)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + JavaScript ES modules, no framework, no build | Nothing to install or configure; Pages serves it as is |
| Hosting | GitHub Pages from `main` → `/docs` | Free, requested |
| Backend | One Cloudflare Worker (JavaScript), deployed with `wrangler` | Free tier, streams responses, holds secrets |
| Search + page reading | Firecrawl API | Free credits, renders JavaScript pages, reads PDFs |
| Extraction LLM | Gemini Flash-class model via Google AI Studio key | Free tier, JSON-schema output |
| Private LLM | Cloudflare Workers AI (binding `AI`) | Free daily allowance; user data stays within Cloudflare |
| Storage | Workers KV | Cache only; no user data |
| Tests | `node --test` | Built into Node; no framework |

**Free-tier facts the design depends on (verify in M0 with `scripts/smoke-test.sh`):**
- Cloudflare Workers: 100k requests/day; 10 ms CPU per request (waiting on network doesn't count); 50 subrequests per request; no hard wall-clock cap while a streaming client stays connected.
- Workers KV free: about 100k reads/day but only **about 1,000 writes/day** → never write per request (R-BE-8).
- Firecrawl free: 1,000 credits/month, about 2 concurrent requests → budget ~7 credits per live lookup, so ≈ 100-140 live lookups a month; the cache is what makes demos safe.
- Gemini free tier: Flash-class models free; **rate limits are not published precisely** → treat 429 as normal (R-BE-12). Google may use free-tier content to improve its products → **only public page text and the typed query ever go to Gemini** (H9).

## 7. Honesty and privacy rules (apply to every spec)

- **H1** Every displayed fact has a source URL, or is shown as "Not stated on the site".
- **H2** Missing information is never guessed. Field status is `stated`, `ambiguous`, or `not_found`.
- **H3** The eligibility verdict is computed by deterministic code, never by a model.
- **H4** Fetched web text is **data**, never instructions. Models only emit the fixed schemas, and have no tools.
- **H5** Show the cycle year and fetch time. Flag a cycle that is past, or a deadline that has passed.
- **H6** Every result links to the official page with the wording "verify on the official site".
- **H7** CV and profile contents are never stored server-side or logged.
- **H8** The refusal path ("could not find an official page for this") is a first-class outcome, not an error.
- **H9** **Privacy routing:** anything derived from the user (CV text, interests, skills, profile) goes only to Workers AI, never to Gemini's free tier. Gemini sees only public page text and the typed programme query.

## 8. Known platform limits (design around them)

- Firecrawl renders JavaScript pages, but **login walls, captchas and bot-blocks** still fail → `blocked`. An empty result after rendering → `js_required`. Both offer the paste-text fallback (R-EXT-12).
- Free quotas are small. Every external call is counted; page text is cached; when credits or Gemini quota run out the app says so and still serves cached lookups (`quota_exhausted`).
- Free models are weaker than frontier ones: hence evidence verification (R-EXT-9), verdict in code, and conservative `ambiguous` handling.
- A lookup can take 20-90 s. The UI must show live progress.

## 9. Repository layout

```
reu-brief/
  CLAUDE.md  SCHEDULE.md  PROGRESS.md  README.md
  specs/                 ← these files
  scripts/smoke-test.sh  ← checks the three provider keys (run before M0)
  docs/                  ← the website (GitHub Pages root)
    index.html  css/  js/ (app.js, api.js, eligibility.js, render.js, profile.js, cv.js)
  worker/
    src/ index.js, sse.js, resolve.js, extract.js, profile.js, match.js, cache.js,
         providers/ (firecrawl.js, gemini.js, workersai.js), llm.js, schema.js, links.js
    scripts/prewarm.mjs
    wrangler.toml
  tests/                 ← node --test (eligibility, evidence-check, links, fixtures)
```

## 10. Definition of done

1. Public Pages URL works on desktop and phone.
2. The 8-query demo set (spec 07 §3) gives the expected outcome for every row.
3. A citizenship-restricted programme gives **Not eligible** for an Indian-citizen profile, with the deciding quote.
4. A made-up programme is refused, not invented.
5. Every non-empty field on the result page has a working source link.
6. No API key in the repo, no CV in logs, no user-derived data sent to Gemini.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Wrong extraction of eligibility (the product's whole point) | Evidence quote per field, evidence verification (R-EXT-9), verdict in code, ambiguous → Unclear |
| Free LLM less accurate than a frontier model | Strict schema, `not_found` over guessing, owner spot-checks in M1-M2, easy provider swap (`llm.js`) |
| Free quotas run out mid-demo | Pre-warmed cache for the demo set (72 h TTL), credit counter, backup recording |
| Gemini free-tier rate limit unknown | Retry once, then `quota_exhausted`; extraction is one call per lookup |
| Abuse of a public endpoint | Demo key header, best-effort in-memory limiter, monthly credit cap |
| Login-walled / bot-blocked sites | `blocked` outcome + paste-text fallback |
| Only ~14 h of real build time | Cut ladder in `SCHEDULE.md`, gate G1 |
| Prompt injection from fetched pages | H4, no tools for models, fixed schemas, link-following restricted to the official domain in code |

## 12. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-26 | Live lookup is the MVP, no curated database | Course requirement |
| 2026-10-26 | Worker backend alongside GitHub Pages | Pages is static and cannot keep an API key |
| 2026-10-26 | Eligibility runs in the browser as pure code | Privacy, testability, H3 |
| 2026-10-26 | Tier/country are labels first, filters only as P2 | Live lookup has no list to filter |
| 2026-10-26 | Build budget cut from ~28 h to ~14 h | Window is 26 h wall-clock including sleep |
| 2026-10-26 | Dropped the paid Claude API; Firecrawl + Gemini free + Workers AI | Owner wants no spend |
| 2026-10-26 | Our code runs the pipeline; models have no tools | Free LLMs have no server-side search/fetch; also simpler to verify (H4) |
| 2026-10-26 | User-derived data → Workers AI only (H9) | Gemini free tier may train on content |
| 2026-10-26 | No per-request KV writes | Free KV allows ~1,000 writes/day |
| 2026-10-26 | M0 model check runs through a Worker `/api/diag/gemini` endpoint and a git-ignored `worker/.dev.vars`, not hand-typed curl in the owner's shell (spec 05) | Owner found the manual smoke test too hands-on; same pattern as the sister project (key in a git-ignored file the owner writes, code loads it) |
| 2026-10-27 | Added `logistics.dates`; quotes for multi-place facts are joined with ` ‖ ` (R-EXT-16) | M1 test on CMU SUAMI: its 2026 page lists dates but no deadline; model joined quotes with "...", which cannot be verified |
| 2026-10-26 | Added fields: other_funding, travel_support, housing, visa_support, optional prior_year_selectivity; full schema built in M1 (R-EXT-15) | Owner request; avoids reworking the schema in M2 |
| 2026-10-27 | Worker is tested in plain Node: `scripts/local.mjs` calls the Worker's `fetch` handler with a file-backed fake KV; `scripts/fake-firecrawl.mjs` stands in for scraping when no Firecrawl key is available (testing only) | The agent shell cannot open a local port, so `wrangler dev` cannot run there; keys stay in the git-ignored `worker/.dev.vars` |
| 2026-10-27 | Evidence checks that the model cannot be trusted with are done in code: conflicting country lists across pages (-> ambiguous, both quotes), countries not named in the quote are dropped, rule `any` needs explicit wording ("all nationalities", "worldwide", ...), empty country lists are filled from the quote | M1 tests on Mitacs, IITGN, ETH: the free models silently merged two different country lists, and read "you are welcome to apply" as open to everyone |
| 2026-10-27 | Link ranking uses the ~70 characters before each link and prefers per-year pages and pages under the programme's own URL; relative links resolve against the final URL after redirects | M1 tests: Mitacs links its real eligibility page as "found here"; CMU keeps details on a `2026/` subpage and redirects to a trailing slash |
| 2026-10-27 | Country scan for conflict detection uses one lookup table and a word-by-word pass (2 ms, was 131 ms) | Workers Free allows about 10 ms CPU per request |
| 2026-10-27 | Rate limit default 30 requests / 10 min per IP (env `RATE_LIMIT`); `/health` reports the month's Firecrawl credits; `ttl_hours` (1-168) on resolve/extract bodies for pre-warming | Spec 05 R-BE-4, R-BE-9, R-BE-11 |
| 2026-10-27 | `MODEL_PUBLIC` = `gemini-3.1-flash-lite,gemini-3.5-flash-lite`; `gemini-3.8-flash` and `gemini-2.5-flash` not used | Measured 26 Oct: 3.8 times out (> 45 s), 2.5 is closed to new keys; lite models answer in 2-25 s |
| 2026-10-27 | Demo key is switchable (`REQUIRE_DEMO_KEY`, default in wrangler.toml now `false`); the page shows the key box only after an `unauthorized` reply | Owner could not retrieve the key and wanted the demo to open without it. Cost: strangers can spend the free quotas until the credit cap or rate limit stops them; flip to `true` to restore |
