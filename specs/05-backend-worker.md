# 05 — Backend (Cloudflare Worker), providers, and deployment

Depends on: 00. Serves: 01, 02, 04. Code: `worker/`.

## Endpoints
All under `https://<worker-subdomain>.workers.dev/api`. JSON in. Responses for `resolve` and `extract` are **Server-Sent Events**; the rest are JSON. Every request except `/health` needs header `X-Demo-Key` (R-BE-3).

| Method + path | Body | Response |
|---|---|---|
| `GET /health` | — | `{ok:true, version, credits_used, credits_cap}` |
| `POST /resolve` | `{query, hints?}` | SSE, final event `result` = spec 01 output |
| `POST /extract` | `{url}` or `{pasted_text, source_hint?}`, `refresh?` | SSE, final event `result` = `Program` |
| `POST /profile` | `{text}` (CV text read in the browser) | JSON profile draft (spec 04) |
| `POST /match` | `{profile, program}` | JSON (spec 04) |

## SSE protocol
Events (each `event:` name + one-line JSON `data:`):
- `stage` — `{ id: "searching"|"choosing"|"reading"|"following"|"extracting"|"verifying", message: string }`; messages are written by our code from templates and URLs ("Reading page 2 of 4: iisc.ac.in/…"), never from model output.
- `result` — final payload.
- `error` — `{ code, message, retryable: boolean }`.
Send a comment line (`: keepalive`) every 10 s so proxies don't close the stream.

## Providers (`worker/src/providers/`, one file each; everything else calls them through `llm.js`/these modules)

**firecrawl.js**
- `search(query, {limit})` → `[{title, url, description}]`. **Confirmed live on 26 Oct:** `POST https://api.firecrawl.dev/v2/search` with `Authorization: Bearer <key>` and body `{query, limit}`; results are at `data.web[]` with `url`, `title`, `description` (can be long markdown; truncate to ~300 chars before sending to the LLM), `position`.
- `scrape(url, {waitFor?})` → `{url, ok, status, markdown, links[]}` (markdown + links; handles JS pages and PDFs).
- At most 2 requests in flight (free plan concurrency). Timeout 30 s per call. Retry once on 429/5xx after 1.5 s.
- Every call adds its credit cost to the monthly counter (R-BE-11). **Check the current Firecrawl docs for endpoint paths and request fields in M0**; wrap them so only this file knows them.

**gemini.js** (the *public lane*)
- `generateJSON({system, user, schema})` → parsed object. Uses the Gemini REST API with the AI Studio key, JSON output mode and a response schema. Timeout 60 s. One retry with 2 s jitter on 429/5xx, then throws `QuotaError`.
- `MODEL_PUBLIC` is a **comma-separated fallback list** (e.g. a Flash model first, then another Flash, then a Flash-Lite). On 429/503 after the one retry, `generateJSON` moves to the next model in the list; only when all fail does it throw `QuotaError` (→ `quota_exhausted` or `upstream_error`). Free-tier models return 503 "high demand" spikes, which is why this exists. The ids to use are **confirmed in M0** with `scripts/smoke-test.sh`.

**workersai.js** (the *private lane*)
- `generateJSON({system, user, schema})` via the `AI` binding; model id from env `MODEL_PRIVATE` (an instruct model that supports JSON output; confirm in M0). The result is validated in code; one repair retry if it isn't valid JSON for the schema.

**llm.js** exposes exactly two functions, `llm.publicJSON(...)` and `llm.privateJSON(...)`. Resolve and extract may only call `publicJSON`; CV parsing and match may only call `privateJSON` (H9). A lint-style test greps for violations.

## Requirements
- **R-BE-1** Secrets: `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `DEMO_KEY`. Never in the page, repo, or logs. `wrangler.toml` holds only non-secret config and the `AI` and `CACHE` bindings.
- **R-BE-2** CORS: allow origins `https://<github-user>.github.io` and `http://localhost:*` only; reply to `OPTIONS` preflight.
- **R-BE-3** Header `X-Demo-Key` must equal secret `DEMO_KEY`. The page asks for it once (entered by the presenter, kept in `sessionStorage`). Missing/wrong → `401 unauthorized`. (A public page can't hide a key; this stops casual abuse. The real protection is the credit cap, R-BE-11.)
- **R-BE-4** Rate limit: best-effort **in-memory** counter per isolate (e.g. 20 requests / 10 min per IP) → `429 rate_limited`. Do **not** use KV for counters (R-BE-8).
- **R-BE-5** Env vars: `MODEL_PUBLIC`, `MODEL_PRIVATE`, `FIRECRAWL_MONTHLY_CAP` (default 900), `ALLOWED_ORIGIN`.
- **R-BE-6** Per-request caps: 1 search; ≤ 6 scrapes (spec 02); page text truncated to 40 000 chars per page and 120 000 chars total sent to the LLM; total wall-clock ≤ 120 s → `timeout`.
- **R-BE-7** Logging: log request id, endpoint, stage names, duration, error code. **Never** log query contents beyond 60 chars, CV text, profile, or page text.
- **R-BE-8** **KV budget (free plan ≈ 1,000 writes/day):** KV namespace `CACHE` holds only: resolve results (24 h), scraped page text (7 days, so re-running extraction after a prompt tweak costs 0 credits), `Program` records (24 h; 72 h when pre-warmed), and one credit counter per month. A write failure is logged and ignored; the request still succeeds.
- **R-BE-9** `worker/scripts/prewarm.mjs` takes a list of URLs/queries and calls the live endpoints, storing results with a 72 h TTL (`ttl_hours` argument), for demo day.
- **R-BE-10** Every `error` uses a code from §6 so the UI can show a specific message.
- **R-BE-11** **Credit guard:** estimated Firecrawl credits are counted in KV key `credits:YYYY-MM`. At `FIRECRAWL_MONTHLY_CAP` the Worker stops live search/scrape and serves cache only; uncached requests get `quota_exhausted` (message says cached examples still work). `/health` shows usage.
- **R-BE-12** Gemini 429/503 errors → one retry, then the next model in `MODEL_PUBLIC`, then `quota_exhausted` with "model quota reached, try again in a minute" (`retryable: true`).
- **R-BE-13** Link-following and fetches are limited to the programme's own site (registrable domain, public-suffix aware), except the single page the user explicitly supplied.

## §6 Error codes
`unauthorized`, `rate_limited`, `bad_input`, `no_program_found` (resolve → none), `aggregator_only`, `js_required` (empty after rendering), `blocked` (login/captcha/403), `page_not_found`, `timeout`, `extraction_incomplete`, `upstream_error`, `quota_exhausted`, `cv_unreadable`. (13 codes.)

## Deployment (M0)
1. Run `scripts/smoke-test.sh` locally with your three keys in the environment (see the script header). It proves the keys work and prints the Flash-class model ids your Gemini key can use.
2. `cd worker && npx wrangler login` (browser sign-in).
3. `npx wrangler kv namespace create CACHE` → paste the id into `wrangler.toml`; add `[ai] binding = "AI"`.
4. `npx wrangler secret put FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `DEMO_KEY`.
5. `npx wrangler deploy` → note the `workers.dev` URL; put it in `docs/js/config.js`.
6. GitHub repo → Settings → Pages → Source: `main`, folder `/docs`.
7. Open the Firecrawl dashboard once to see how credits are consumed per call, and adjust the per-call cost constants in `firecrawl.js`.

## Acceptance
| ID | Check |
|---|---|
| B1 | `/health` OK; wrong `X-Demo-Key` → 401 |
| B2 | Pages origin can call the Worker; another origin is rejected by CORS |
| B3 | Rate limit returns 429 after the configured burst from one IP |
| B4 | `/extract` streams ≥ 3 `stage` events before `result` on a real programme |
| B5 | Killing the connection mid-stream doesn't crash the Worker |
| B6 | Searching the repo for any key string finds nothing |
| B7 | With `FIRECRAWL_MONTHLY_CAP` set to 0, an uncached lookup returns `quota_exhausted` and a cached one still works |
| B8 | A test greps `worker/src` and fails if `resolve.js`/`extract.js` call `privateJSON` or `profile.js`/`match.js` call `publicJSON` |
| B9 | A full lookup does ≤ 1 search and ≤ 6 scrapes (logged counts) |
