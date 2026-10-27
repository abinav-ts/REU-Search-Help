// Drives the real page (docs/index.html + docs/js/app.js) in jsdom against a FAKE Worker.
// Local testing only. Needs jsdom installed outside the repo:  JSDOM_DIR=/path/with/node_modules node scripts/dom-smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(process.env.JSDOM_DIR, "package.json"));
const { JSDOM } = require("jsdom");
const tmp = process.env.TMPDIR || "/tmp";

// jsdom can't run ES modules, so bundle the page's script into one plain script first.
const bundle = path.join(tmp, "app.bundle.js");
execFileSync(path.join(root, "worker/node_modules/.bin/esbuild"), [path.join(root, "docs/js/app.js"), "--bundle", "--format=iife", `--outfile=${bundle}`, "--log-level=error"]);

const fixture = (n) => JSON.parse(fs.readFileSync(path.join(root, `tests/fixtures/program-${n}.json`), "utf8"));
const html = fs.readFileSync(path.join(root, "docs/index.html"), "utf8").replace(/<script type="module"[^>]*><\/script>/, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.github.io/REU-Search-Help/", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
window.Element.prototype.scrollIntoView = () => {};
window.TextEncoder = TextEncoder; window.TextDecoder = TextDecoder; window.AbortController = AbortController;
window.ReadableStream = ReadableStream; window.Response = Response;

// ---- the fake Worker: scripted replies per endpoint ----
const calls = [];
let script = {};
const sse = (events) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const [n, d] of events) c.enqueue(e.encode(`event: ${n}\ndata: ${JSON.stringify(d)}\n\n`)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
window.fetch = async (url, init) => {
  const p = new URL(url).pathname;
  calls.push({ p, body: init?.body ? JSON.parse(init.body) : null, key: init?.headers?.["X-Demo-Key"] });
  const r = script[p];
  if (!r) throw new Error("no script for " + p);
  return typeof r === "function" ? r(init) : r;
};

window.eval(fs.readFileSync(bundle, "utf8"));

const $ = (id) => document.getElementById(id);
const text = () => document.body.textContent.replace(/\s+/g, " ");
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
let failures = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) failures++; };

// 1. example chips exist; demo key box visible when no key stored
check("example chips are rendered", document.querySelectorAll("#examples button").length >= 3);
check("demo key box is shown when no key is stored", $("key-box").hidden === false);

// 2. search -> single -> extract -> result, with no profile yet
$("demo-key").value = "k123";
script["/api/resolve"] = () => sse([["stage", { id: "searching", message: "Searching the web" }], ["result", { outcome: "single", candidates: [{ name: "Mitacs Globalink Research Internship", organization: "Mitacs", official_url: "https://www.mitacs.ca/our-programs/globalink-research-internship/", source_kind: "official", confidence: 0.95, reason: "x", cycle_hint: "" }] }]]);
script["/api/extract"] = () => sse([["stage", { id: "reading", message: "Reading mitacs.ca/our-programs" }], ["result", fixture("mitacs")]]);
$("query").value = "mitacs globalink";
$("search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(200);
check("progress messages appear", text().includes("Searching the web") && text().includes("Reading mitacs.ca"));
check("'Is this the programme you meant?' chip shown", text().includes("Is this the programme you meant?"));
check("result page rendered with the programme name", $("result").textContent.includes("Mitacs Globalink Research Internship"));
check("no profile -> asks for the profile, no verdict", text().includes("Add your profile to get an eligibility verdict"));
check("demo key was sent with the calls", calls.every((c) => c.key === "k123"));
check("extract was called with the resolved URL", calls.find((c) => c.p === "/api/extract")?.body?.url?.includes("mitacs.ca"));
check("state is done", document.body.dataset.state === "done");

// 3. profile dialog: fill, save -> verdict appears without another lookup
click(document.querySelector('[data-action="edit-profile"]'));
check("profile dialog opens", $("profile-dialog").hasAttribute("open"));
const chipInput = (id, v) => { const i = $(id).querySelector("input"); i.value = v; i.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); };
chipInput("f-citizen", "Indian");
$("f-inst").value = "India"; $("f-level").value = "bachelors"; $("f-year").value = "3";
const callsBefore = calls.length;
$("profile-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick();
check("profile saved: country alias 'Indian' became 'India'", JSON.parse(window.localStorage.getItem("reuBriefProfile")).citizenships[0] === "India");
check("verdict appears after saving the profile", /Unclear|Eligible|Not eligible/.test($("result").textContent));
check("no new network call after changing the profile (U6)", calls.length === callsBefore);
check("profile button shows a summary", $("profile-label").textContent.includes("India"));

// 4. conflicting country lists -> Unclear, never a confident verdict
check("Mitacs (conflicting lists) is Unclear for the Indian profile", $("result").querySelector(".verdict-unclear") !== null);

// 5. a candidate list (multiple) and picking one
script["/api/resolve"] = () => sse([["result", { outcome: "multiple", candidates: [
  { name: "SRF A", organization: "Org A", official_url: "https://a.edu/srf", source_kind: "official", confidence: 0.6, reason: "one", cycle_hint: "2026" },
  { name: "SRF B", organization: "Org B", official_url: "https://b.edu/srf", source_kind: "official", confidence: 0.5, reason: "two", cycle_hint: "" }] }]]);
script["/api/extract"] = () => sse([["result", fixture("cmu-suami")]]);
$("query").value = "SRF";
$("search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(100);
check("two candidate cards shown", document.querySelectorAll("#candidates .card").length === 2);
click(document.querySelector('[data-action="pick"]'));
await tick(100);
check("picking a card extracts that URL without retyping (U3)", calls.at(-1).body.url === "https://a.edu/srf");
check("second result rendered", $("result").textContent.includes("Summer Undergraduate Applied Mathematics Institute"));

// 6. error states
for (const code of ["unauthorized", "rate_limited", "no_program_found", "js_required", "blocked", "page_not_found", "timeout", "extraction_incomplete", "upstream_error", "quota_exhausted", "bad_input"]) {
  script["/api/resolve"] = () => sse([["error", { code, message: "server text", retryable: false }]]);
  $("query").value = "x";
  $("search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick(60);
  const panel = $("error-panel");
  check(`error '${code}' shows its own panel`, !panel.hidden && panel.querySelector("h3").textContent.length > 3);
  if (code === "blocked" || code === "js_required") check(`error '${code}' offers the paste-text box`, !$("paste-box").hidden);
}
script["/api/resolve"] = () => sse([["stage", { id: "s", message: "Searching" }]]); // stream ends with no result
$("search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(60);
check("a dropped connection shows 'Connection lost' instead of hanging (R-UI-7)", $("error-panel").textContent.includes("Connection lost"));

// 7. none / refusal
script["/api/resolve"] = () => sse([["result", { outcome: "none", candidates: [], message: 'I searched for "Zorblax" and could not find an official page.' }]]);
$("query").value = "Zorblax Quantum Fellowship 2027";
$("search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(60);
check("refusal shows the message and no result", $("error-panel").textContent.includes("Zorblax") && $("result").textContent === "");

// 7b. CV prefill (P1, P2) and shared fields (P3), then the keyword fallback
script["/api/extract"] = () => sse([["result", fixture("cmu-suami")]]);
script["/api/resolve"] = () => sse([["result", { outcome: "single", candidates: [{ name: "SUAMI", organization: "CMU", official_url: "https://www.cmu.edu/math/undergrad/suami", source_kind: "official", confidence: 0.9, reason: "", cycle_hint: "" }] }]]);
$("query").value = "suami";
$("search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(120);
click($("profile-button")); click($("profile-clear")); await tick(); // start from an empty profile
click($("profile-button")); await tick();
$("cv-text").value = "Priya Sharma, B.Sc. Physics. ".repeat(20);
script["/api/profile"] = () => Response.json({ interests: ["liquid crystals", "numerical PDEs"], skills: ["Python"], research_experience: [{ title: "Simulation", topics: ["finite elements"] }], fields_of_study: ["physics"], degree_level: "bachelors", year_of_study: 3, institution_country: "India", gpa: { value: 8.4, scale: 10 } });
click($("cv-go")); await tick(80);
check("P1 CV prefills interests and skills (editable chips)", $("f-interests").textContent.includes("liquid crystals") && $("f-skills").textContent.includes("Python"));
check("P2 citizenship stays empty after a CV upload", $("f-citizen").querySelectorAll(".chip").length === 0);
check("CV text is cleared from the page after reading", $("cv-text").value === "");
check("CV request carried only the text", Object.keys(calls.filter((c) => c.p === "/api/profile").at(-1).body).join() === "text");
chipInput("f-citizen", "India");
script["/api/match"] = () => Response.json({ fit: "strong", shared: [{ yours: "liquid crystals", theirs: "Liquid crystals", note: "same topic" }], gaps: [] });
$("profile-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(120);
check("P3 shared fields show both sides", $("result").textContent.includes("Shared with your profile") && $("result").textContent.includes("liquid crystals") && $("result").textContent.includes("same topic"));
check("match request contained no citizenship or name", !JSON.stringify(calls.filter((c) => c.p === "/api/match").at(-1).body).match(/India|citizen|Priya/i));
script["/api/match"] = () => { throw new Error("down"); };
$("profile-form").dispatchEvent(new window.Event("submit", { cancelable: true })); // same profile -> cached; change it to force a call
chipInput("f-skills", "numerical PDEs");
$("profile-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await tick(120);
check("R-MAT-4 falls back to keyword overlap when the match call fails", $("result").textContent.includes("simple keyword match"));

// 8. clear my data
click($("profile-button")); click($("profile-clear")); await tick();
check("Clear my data empties the stored profile", !JSON.parse(window.localStorage.getItem("reuBriefProfile") || "{}").citizenships?.length);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
