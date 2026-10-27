# REU Brief

Type the name of a summer research programme, or a vague half-remembered description of one, and get a one-page brief: whether *you* are eligible (computed in code, with the deciding quote), the problem statement, topics you share with your CV, the number of statements of purpose and recommendation letters, mentors, deadline, funding, and a source link and quote for every fact.

**Live site:** https://abinav-ts.github.io/REU-Search-Help/ 

## How it works

```
Browser (GitHub Pages)  →  Cloudflare Worker  →  Firecrawl (search + read pages)
 profile + eligibility        runs the pipeline     Gemini Flash-Lite (reads public page text only)
 CV read locally              holds the keys        Workers AI (anything derived from you)
                                                    Workers KV (cache)
```

1. **Resolve** – the name/link/description becomes one official page (or a short pick-list, or an honest refusal). A model only picks result *numbers*, so it cannot invent a URL.
2. **Extract** – the Worker reads the page and a few linked pages on the same site, then asks a model to fill a fixed record. Every fact carries a verbatim quote.
3. **Verify** – code checks each quote against the fetched text, finds the page it came from, flags pages that contradict each other, drops countries a quote does not name, and refuses "open to everyone" without explicit wording.
4. **Decide** – `docs/js/eligibility.js` compares the record with your profile. The verdict (Eligible / Not eligible / Unclear) is never produced by a model.

### Honesty and privacy rules
Every fact has a source or is shown as "Not stated on the site"; nothing is guessed; fetched web text is treated as data, never instructions; your profile and CV stay in your browser (the CV text is sent once to Workers AI for parsing and is neither stored nor logged); nothing derived from you ever goes to Gemini. Full list: `specs/00-global.md` §7.

## Known limits
Sites that need a login, block automated readers, or only work with JavaScript may not be readable (paste the page text instead). Programme terms change: always verify on the official site. Free-tier models and quotas are small, so repeat lookups are served from a cache. This is not legal or visa advice.

## Repository tour
- `specs/` – the specs that drove the build (start with `00-global.md`); `SCHEDULE.md`, `PROGRESS.md`
- `docs/` – the website (plain HTML/CSS/JS modules, no build step): `js/eligibility.js`, `render.js`, `profile.js`, `app.js`
- `worker/` – the Cloudflare Worker: `src/resolve.js`, `extract.js`, `verify.js`, `schema.js`, `providers/`
- `tests/` – `node --test` (eligibility truth table, evidence checks, privacy routing, saved real extractions)
- `scripts/` – local runner, fake-browser smoke test, prompt-injection check

## Run it
- Tests: `node --test`
- Worker without a server: `NODE_USE_ENV_PROXY=1 node scripts/local.mjs POST /api/extract '{"url":"https://..."}'` (keys from `worker/.dev.vars`, see `worker/.dev.vars.example`)
- Deploy: `cd worker && npx wrangler secret put DEMO_KEY` (and `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`), then `npx wrangler deploy`
- Pre-warm the demo cache: `DEMO_KEY=... node worker/scripts/prewarm.mjs <worker-url> "<query>" ...`
