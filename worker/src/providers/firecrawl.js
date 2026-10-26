// Firecrawl provider (search + scrape). Only this file knows Firecrawl's request shapes.
// Checked against the Firecrawl docs on 26-27 Oct 2026:
//   POST https://api.firecrawl.dev/v2/search  {query, limit}        -> data.web[] {url,title,description}
//   POST https://api.firecrawl.dev/v2/scrape  {url, formats:[..]}   -> data.markdown, data.links, data.metadata.statusCode
// Credits (free plan = 1,000/month): search ~2 per 10 results, scrape 1 per page (PDFs 1 per page).
import { ApiError } from "../errors.js";

const BASE = "https://api.firecrawl.dev/v2";

// At most 2 requests in flight at once (free plan concurrency).
let inFlight = 0;
const waiting = [];
async function slot() {
  if (inFlight >= 2) await new Promise((r) => waiting.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

async function post(env, path, body, timeoutMs) {
  await slot();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetch(BASE + path, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (attempt === 0 && e?.name !== "TimeoutError") { await new Promise((r) => setTimeout(r, 1500)); continue; }
        throw new ApiError("timeout", "The page took too long to load.", true, 504);
      }
      // Retry once on 429/5xx after 1.5 s (spec 05).
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }
  } finally {
    release();
  }
}

// -> [{title, url, description}]  (description trimmed: it can be long markdown)
export async function search(env, query, limit = 8) {
  const { status, data } = await post(env, "/search", { query, limit }, 30000);
  if (status === 402) throw new ApiError("quota_exhausted", "The free page-reading limit is used up. Cached examples still work.", false, 429);
  if (status >= 400) throw new ApiError("upstream_error", "Web search failed. Please try again.", true, 502);
  const web = data?.data?.web ?? [];
  return web
    .filter((r) => r?.url)
    .map((r) => ({ title: String(r.title || "").slice(0, 200), url: r.url, description: String(r.description || "").replace(/\s+/g, " ").slice(0, 300) }));
}

export const SEARCH_CREDITS = 2;

// -> {url, ok, status, markdown, links[], error?}
// `error` is one of: page_not_found | blocked | timeout | upstream_error | quota_exhausted
export async function scrape(env, url, { waitFor } = {}) {
  const body = { url, formats: ["markdown", "links"], onlyMainContent: true, timeout: 30000 };
  if (waitFor) body.waitFor = waitFor;
  let res;
  try {
    res = await post(env, "/scrape", body, 40000);
  } catch (e) {
    if (e instanceof ApiError) return { url, ok: false, status: 0, markdown: "", links: [], error: e.code };
    throw e;
  }
  const { status, data } = res;
  if (status === 402) return { url, ok: false, status, markdown: "", links: [], error: "quota_exhausted" };
  const d = data?.data;
  const pageStatus = d?.metadata?.statusCode ?? 0;
  if (status >= 400 || !data?.success) {
    const msg = String(data?.error || "").toLowerCase();
    let error = "upstream_error";
    if (pageStatus === 404 || /\b404\b|not found/.test(msg)) error = "page_not_found";
    else if ([401, 403, 429].includes(pageStatus) || /\b40[13]\b|forbidden|blocked|captcha|denied/.test(msg)) error = "blocked";
    else if (/timed? ?out|timeout/.test(msg)) error = "timeout";
    return { url, ok: false, status: pageStatus || status, markdown: "", links: [], error };
  }
  if (pageStatus === 404) return { url, ok: false, status: 404, markdown: "", links: [], error: "page_not_found" };
  if ([401, 403].includes(pageStatus)) return { url, ok: false, status: pageStatus, markdown: "", links: [], error: "blocked" };
  const links = (d?.links ?? []).map((l) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
  return { url: d?.metadata?.url || url, ok: true, status: pageStatus || 200, markdown: d?.markdown || "", links };
}

export const SCRAPE_CREDITS = 1;
