// Link and host rules (spec 01 R-RES-1/3, spec 02 R-EXT-1, spec 05 R-BE-13).
// Plain functions, no network: easy to test (tests/links.test.js).

// Hosts that are forums/social media: never an official page; only used to recover a name.
const FORUM_HOSTS = [
  "reddit.com", "quora.com", "x.com", "twitter.com", "linkedin.com", "facebook.com",
  "youtube.com", "youtu.be", "instagram.com", "telegram.me", "t.me", "medium.com", "tiktok.com",
];

// Listing/aggregator/news sites: useful as a lead, never the official page.
const AGGREGATOR_HOSTS = [
  "opportunitydesk.org", "opportunitiesforafricans.com", "scholars4dev.com", "internshala.com",
  "youthop.com", "studyportals.com", "findaphd.com", "findamasters.com", "collegedunia.com",
  "shiksha.com", "careers360.com", "scholarshipportal.com", "indeed.com", "glassdoor.com",
  "naukri.com", "oyaop.com", "pathwaystoscience.org", "studyabroad.shiksha.com", "mastersportal.com",
  "scholarshipdb.net", "fellowships.in", "wikipedia.org", "timesofindia.indiatimes.com",
  "thehindu.com", "indianexpress.com", "hindustantimes.com", "ndtv.com", "edufund.in",
  "bigfuture.collegeboard.org", "niche.com", "unigo.com", "prospects.ac.uk", "scholarshipsads.com",
];

// Two-label public suffixes we must treat as ONE suffix (so "ac.in" alone is never "a site").
// Not the full public-suffix list; covers the countries this app is likely to meet.
const TWO_LABEL_SUFFIXES = new Set([
  "ac.in", "edu.in", "co.in", "org.in", "gov.in", "nic.in", "res.in", "net.in", "firm.in",
  "ac.uk", "co.uk", "org.uk", "gov.uk", "edu.au", "com.au", "org.au", "gov.au", "ac.jp", "co.jp",
  "or.jp", "ac.kr", "co.kr", "edu.cn", "ac.cn", "com.cn", "org.cn", "ac.za", "co.za", "edu.sg",
  "com.sg", "ac.nz", "co.nz", "ac.il", "edu.hk", "com.hk", "edu.tw", "edu.my", "edu.br", "com.br",
  "edu.mx", "com.mx", "ac.ir", "edu.pk", "edu.eg", "ac.th", "ac.id", "edu.tr", "ac.at", "co.at",
]);

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// "apply.iisc.ac.in" -> "iisc.ac.in". Returns null when the host IS a public suffix
// ("ac.in", "com") or is an IP address, because those must never be allowed (R-EXT-1).
export function registrableDomain(host) {
  if (!host) return null;
  host = host.toLowerCase().replace(/\.$/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  }
  return lastTwo;
}

// True when `candidate` is on the same registrable domain as `base` (R-EXT-1, R-BE-13).
export function sameSite(baseUrl, candidateUrl) {
  const a = registrableDomain(hostOf(baseUrl));
  const b = registrableDomain(hostOf(candidateUrl));
  return Boolean(a && b && a === b);
}

function hostMatches(host, list) {
  return list.some((h) => host === h || host.endsWith("." + h));
}

export function isForumHost(url) {
  const h = hostOf(url);
  return Boolean(h && hostMatches(h, FORUM_HOSTS));
}

export function isAggregatorHost(url) {
  const h = hostOf(url);
  return Boolean(h && hostMatches(h, AGGREGATOR_HOSTS));
}

// Code re-check of what the model says about a result (R-RES-3): a host on our lists
// can never be "official", whatever the model claimed.
export function sourceKindFor(url, modelKind) {
  if (isForumHost(url)) return "forum";
  if (isAggregatorHost(url)) return modelKind === "news" ? "news" : "aggregator";
  return ["official", "aggregator", "forum", "news"].includes(modelKind) ? modelKind : "aggregator";
}

// Canonical form used for cache keys and de-duplication: no fragment, no trailing slash,
// no tracking parameters, lowercase host.
export function normaliseUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

export function looksLikeUrl(text) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

// ---- Choosing which same-site links to read (spec 02 R-EXT-2) ----

const KEYWORDS = [
  [/eligib/i, 6], [/who[-_ ]can[-_ ]apply/i, 6], [/\bhow[-_ ]to[-_ ]apply/i, 5], [/\bapply\b|application/i, 4],
  [/\bfaq|frequently/i, 4], [/requirement|criteria/i, 4], [/admission/i, 3],
  [/people|mentor|faculty|supervisor|host/i, 3], [/project|research[-_ ]areas?|topics?/i, 3],
  [/brochure|guideline|handbook|call[-_ ]for/i, 3], [/\.pdf(\?|$)/i, 2],
  [/stipend|funding|support|benefit|housing|visa/i, 2], [/program|fellowship|internship|reu/i, 1],
];
const PENALTIES = [
  /privacy|cookie|terms|login|log-in|signin|sign-in|register|account|donate|shop|store/i,
  /news|blog|press|event|calendar|alumni|gallery|photo|video|careers|jobs|contact|sitemap/i,
  /\.(jpg|jpeg|png|gif|svg|webp|zip|mp4|docx?|xlsx?|pptx?)(\?|$)/i,
  /^(mailto|tel|javascript):/i,
];

// links: [{url, text?}]. Returns up to `max` same-site candidates, best first.
export function rankLinks(baseUrl, links, max = 3, now = new Date()) {
  const thisYear = now.getUTCFullYear();
  const baseKey = normaliseUrl(baseUrl);
  const seen = new Set([baseKey]);
  const scored = [];
  for (const l of links) {
    const url = normaliseUrl(l.url);
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    seen.add(url);
    if (!sameSite(baseUrl, url)) continue; // R-EXT-1: never leave the programme's own site
    const hay = `${l.text || ""} ${decodeURIComponent(url.replace(/^https?:\/\/[^/]+/, ""))}`;
    if (PENALTIES.some((p) => p.test(url))) continue;
    let score = 0;
    for (const [re, pts] of KEYWORDS) if (re.test(hay)) score += pts;
    if (/news|blog|press|event/i.test(hay)) score -= 3;
    // Programme sites often keep the real details on a per-year page ("2026"). Prefer the latest.
    const y = (l.text || "").trim().match(/^(?:[A-Za-z ]{0,20})?(20\d\d)$/)?.[1] || url.match(/\/(20\d\d)(?:\/|\.|$)/)?.[1];
    if (y && Number(y) >= thisYear - 1 && Number(y) <= thisYear + 1) score += 5 + (Number(y) - 2000) / 100;
    if (score > 0) scored.push({ url, score, text: l.text || "" });
  }
  scored.sort((a, b) => b.score - a.score || a.url.length - b.url.length);
  return scored.slice(0, max);
}

// Pull [text](url) pairs out of markdown, so link ranking can use the anchor text.
export function markdownLinks(markdown, baseUrl) {
  const out = [];
  const re = /\[([^\]]{1,200})\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
  let m;
  while ((m = re.exec(markdown || "")) !== null) {
    try {
      out.push({ text: m[1].replace(/\s+/g, " ").trim(), url: new URL(m[2], baseUrl).toString() });
    } catch { /* skip malformed link */ }
  }
  return out;
}
