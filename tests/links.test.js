import test from "node:test";
import assert from "node:assert/strict";
import { registrableDomain, sameSite, sourceKindFor, rankLinks, markdownLinks, normaliseUrl } from "../worker/src/links.js";

test("R-EXT-1 registrable domain is public-suffix aware", () => {
  assert.equal(registrableDomain("apply.iisc.ac.in"), "iisc.ac.in");
  assert.equal(registrableDomain("iisc.ac.in"), "iisc.ac.in");
  assert.equal(registrableDomain("ac.in"), null); // a public suffix is never a site
  assert.equal(registrableDomain("www.cmu.edu"), "cmu.edu");
  assert.equal(registrableDomain("math.cmu.edu"), "cmu.edu");
  assert.equal(registrableDomain("co.uk"), null);
  assert.equal(registrableDomain("localhost"), null);
  assert.equal(registrableDomain("127.0.0.1"), null);
});

test("R-EXT-1 sameSite allows subdomains, rejects other sites and look-alikes", () => {
  assert.ok(sameSite("https://apply.iisc.ac.in/x", "https://iisc.ac.in/faq"));
  assert.ok(!sameSite("https://iisc.ac.in", "https://iitgn.ac.in"));
  assert.ok(!sameSite("https://iisc.ac.in", "https://iisc.ac.in.evil.com/"));
  assert.ok(!sameSite("https://iisc.ac.in", "https://evilac.in/"));
});

test("R-RES-1/3 forum and aggregator hosts are never official", () => {
  assert.equal(sourceKindFor("https://www.reddit.com/r/x", "official"), "forum");
  assert.equal(sourceKindFor("https://opportunitydesk.org/x", "official"), "aggregator");
  assert.equal(sourceKindFor("https://www.mitacs.ca/x", "official"), "official");
});

test("R-EXT-2 rankLinks keeps same-site links and prefers eligibility/FAQ/apply pages", () => {
  const base = "https://www.iitgn.ac.in/surf";
  const links = [
    { url: "https://www.iitgn.ac.in/surf/faq", text: "FAQ" },
    { url: "https://www.iitgn.ac.in/news/2025", text: "News" },
    { url: "https://example.com/eligibility", text: "Eligibility" },
    { url: "https://www.iitgn.ac.in/surf/eligibility#top", text: "Eligibility criteria" },
    { url: "https://www.iitgn.ac.in/privacy", text: "Privacy" },
    { url: "https://www.iitgn.ac.in/surf", text: "self" },
  ];
  const r = rankLinks(base, links, 3).map((x) => x.url);
  assert.deepEqual(r, ["https://www.iitgn.ac.in/surf/eligibility", "https://www.iitgn.ac.in/surf/faq"]);
});

test("markdownLinks reads anchor text and resolves relative links", () => {
  const l = markdownLinks("See [Who can apply](/apply/who) and [x](https://a.com/b).", "https://s.edu/prog/");
  assert.equal(l[0].text, "Who can apply");
  assert.equal(l[0].url, "https://s.edu/apply/who");
  assert.equal(l.length, 2);
});

test("normaliseUrl drops fragments, trailing slash and tracking params", () => {
  assert.equal(normaliseUrl("https://A.com/p/?utm_source=x#top"), "https://a.com/p");
});

test("R-EXT-2 per-year pages: the latest year link is chosen, relative to the final URL", () => {
  const base = "https://www.cmu.edu/math/undergrad/suami/"; // final URL has the trailing slash
  const links = markdownLinks("[2026](2026/index.html) [2025](2025/index.html) [2021](2021/index.html)", base);
  assert.equal(links[0].url, "https://www.cmu.edu/math/undergrad/suami/2026/index.html");
  const r = rankLinks(base, links, 3, new Date("2026-10-27"));
  assert.equal(r[0].url, "https://www.cmu.edu/math/undergrad/suami/2026/index.html");
  assert.ok(!r.some((x) => x.url.includes("2021")));
});

test("R-EXT-2 'found here' links are ranked by the words before them; upload-folder years are ignored", () => {
  const base = "https://www.mitacs.ca/our-programs/globalink-research-internship/";
  const md = "Eligibility requirements for 2027 can be [found here](https://www.mitacs.ca/our-programs/globalink-research-internship-students/) and [letter guide](https://www.mitacs.ca/wp-content/uploads/2025/03/Guidelines.pdf).";
  const links = markdownLinks(md, base);
  const r = rankLinks(base, [{ url: "https://www.mitacs.ca/our-programs/training", text: "Training" }, ...links], 3, new Date("2026-10-27"));
  assert.equal(r[0].url, "https://www.mitacs.ca/our-programs/globalink-research-internship-students");
});
