// LOCAL TESTING ONLY. Stands in for Firecrawl's /v2/scrape when no Firecrawl key is available:
// fetches the page over plain HTTP and returns {markdown, links, metadata} in Firecrawl's shape.
// It does NOT run JavaScript and is cruder than Firecrawl, so results are a lower bound.
// Usage: import { installFakeFirecrawl } from "./fake-firecrawl.mjs"; installFakeFirecrawl();

const SKIP = new Set(["script", "style", "noscript", "svg", "nav", "footer", "header", "aside", "form", "iframe"]);
const BLOCK = new Set(["p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "tr", "section", "article", "table", "details", "summary"]);

function decode(s) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function htmlToMarkdown(html, baseUrl) {
  const links = new Set();
  // every link on the page (including nav) goes into `links`, like Firecrawl's links format
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    try { links.add(new URL(decode(m[1]), baseUrl).toString()); } catch { /* skip */ }
  }
  // drop comments, doctype and the <head> block (Firecrawl's markdown has none of these)
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/gi, "").replace(/<head[\s\S]*?<\/head>/gi, "");
  const out = [];
  let skip = 0;
  let href = null;
  let linkText = "";
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[4] !== undefined) {
      if (skip) continue;
      const text = decode(m[4]).replace(/\s+/g, " ");
      if (href !== null) linkText += text; else out.push(text);
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (SKIP.has(tag)) { skip = Math.max(0, skip + (closing ? -1 : 1)); continue; }
    if (skip) continue;
    if (tag === "a") {
      if (!closing) {
        const h = m[3].match(/href\s*=\s*["']([^"']*)["']/i);
        href = h ? h[1] : null;
        if (href === null) href = null;
        else { linkText = ""; }
      } else if (href !== null) {
        const t = linkText.trim();
        let abs = null;
        try { abs = new URL(decode(href), baseUrl).toString(); } catch { /* ignore */ }
        out.push(t && abs && !href.startsWith("#") ? `[${t}](${abs})` : t);
        href = null; linkText = "";
      }
      continue;
    }
    if (BLOCK.has(tag)) out.push("\n");
    if (tag === "li" && !closing) out.push("- ");
    if (/^h[1-4]$/.test(tag) && !closing) out.push("\n## ");
  }
  const markdown = out.join("").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();
  return { markdown, links: [...links] };
}

export function installFakeFirecrawl({ log = console.error } = {}) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("https://api.firecrawl.dev/v2/scrape")) return realFetch(input, init);
    const { url: target } = JSON.parse(init.body);
    log(`[fake-firecrawl] GET ${target}`);
    let res;
    try {
      res = await realFetch(target, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; REU-Brief-test)", Accept: "text/html,application/pdf;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      return Response.json({ success: false, error: "timed out" }, { status: 500 });
    }
    if (!res.ok) {
      return Response.json({ success: false, error: `HTTP ${res.status}`, data: { metadata: { statusCode: res.status } } }, { status: res.status === 404 ? 200 : 200 });
    }
    const type = res.headers.get("content-type") || "";
    if (!type.includes("html")) {
      // PDFs are not converted by this stand-in; Firecrawl would do it.
      return Response.json({ success: true, data: { markdown: "", links: [], metadata: { statusCode: 200, url: res.url } } });
    }
    const { markdown, links } = htmlToMarkdown(await res.text(), res.url);
    return Response.json({ success: true, data: { markdown, links, metadata: { statusCode: 200, url: res.url, sourceURL: target } } });
  };
}
