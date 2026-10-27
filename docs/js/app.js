// REU Brief page logic (spec 06). State machine:
//   idle -> resolving -> (choosing)? -> extracting -> done      (error reachable from anywhere)
import { WORKER_URL } from "./config.js";
import { postStream, postJSON } from "./api.js";
import { pdfToText } from "./cv.js";
import { keywordOverlap } from "./match.js";
import { evaluate } from "./eligibility.js";
import { h, renderResult, matchNode } from "./render.js";
import { errorInfo } from "./errors.js";
import { EMPTY, loadProfile, saveProfile, clearProfile, isComplete, summary, chipField, countryDatalist } from "./profile.js";
import { normalizeCountry } from "./eligibility.js";

const $ = (id) => document.getElementById(id);

// ---- demo key (kept for this tab only; R-UI-6) ----
const keyInput = $("demo-key");
try { keyInput.value = sessionStorage.getItem("demoKey") || ""; } catch (e) { /* storage blocked: key just isn't remembered */ }
// The key box appears only if the server answers "unauthorized" (see showError); with the key switched off it never shows.
$("key-box").hidden = true;
const saveKey = () => { try { sessionStorage.setItem("demoKey", keyInput.value); } catch (e) { /* ignore */ } };

// ---- state ----
let state = "idle";
let controller = null;
let timer = null;
let lastProgram = null;
let lastQuery = "";
let profile = loadProfile();
let pendingExperience = null; // research experience read from a CV, kept until the user saves

function setState(s) {
  state = s;
  document.body.dataset.state = s;
  const busy = s === "resolving" || s === "extracting";
  $("go").disabled = busy;
  $("cancel").hidden = !busy;
  $("progress").classList.toggle("done", !busy);
  if (busy) {
    const t0 = Date.now();
    $("elapsed").hidden = false;
    clearInterval(timer);
    timer = setInterval(() => { $("elapsed").textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    $("elapsed").textContent = "0 s";
  } else {
    clearInterval(timer);
    $("elapsed").hidden = true;
  }
}

function clearOutput({ keepResult = false } = {}) {
  $("progress").replaceChildren();
  $("error-panel").hidden = true;
  $("info-panel").hidden = true;
  $("paste-box").hidden = true;
  $("candidates").replaceChildren();
  $("meant").hidden = true;
  if (!keepResult) { $("result").replaceChildren(); lastProgram = null; }
}

const addStage = (text) => $("progress").append(h("li", {}, text));

// ---- calling the Worker ----
// Returns the `result` payload, or null after showing an error / cancel.
async function run(path, body) {
  controller = new AbortController();
  let result = null;
  let failed = null;
  // Always show something right away, and say so if the server is slow to answer.
  addStage("Contacting the server…");
  let heard = false;
  const watchdog = setTimeout(() => { if (!heard) addStage("Still waiting for the server. The free services can be slow; this can take up to a minute…"); }, 20000);
  try {
    await postStream(path, body, keyInput.value, (name, data) => {
      heard = true;
      if (name === "stage") addStage(data.message);
      else if (name === "result") result = data;
      else if (name === "error") failed = data;
    }, controller.signal);
    // The stream ended without a result and without an error: the connection dropped (R-UI-7).
    if (!result && !failed) failed = { code: "network" };
  } catch (e) {
    if (e.name === "AbortError") { addStage("Cancelled."); return null; }
    failed = e;
  } finally {
    clearTimeout(watchdog);
  }
  if (failed) { showError(failed); return null; }
  return result;
}

function showError(err) {
  const info = errorInfo(err.code);
  setState("error");
  const panel = $("error-panel");
  panel.replaceChildren(h("h3", {}, info.title), h("p", {}, info.text), err.code === "page" ? h("p", { class: "muted" }, err.message) : null);
  if (info.action === "retry" || info.action === "examples") {
    panel.append(h("p", {}, h("button", { type: "button", class: "secondary", "data-action": "retry" }, "Try again")));
  }
  if (info.action === "key") { $("key-box").hidden = false; keyInput.focus(); }
  if (info.action === "paste") $("paste-box").hidden = false;
  panel.hidden = false;
  if (info.action === "examples") $("examples").scrollIntoView({ block: "nearest" });
}

// A script error must never look like "nothing happened".
window.addEventListener("error", (e) => showError({ code: "page", message: `Page error: ${e.message}` }));
window.addEventListener("unhandledrejection", (e) => showError({ code: "page", message: `Page error: ${e.reason?.message || e.reason}` }));

// ---- the flow ----
async function lookup(query) {
  lastQuery = query;
  saveKey();
  clearOutput();
  setState("resolving");
  const out = await run("/api/resolve", { query });
  if (!out) { if (state !== "error") setState("idle"); return; }

  if (out.outcome === "single") {
    const c = out.candidates[0];
    showMeant(c);
    await extract({ url: c.official_url });
  } else if (out.outcome === "multiple") {
    setState("choosing");
    $("info-panel").replaceChildren(h("p", {}, "Several programmes match. Which one do you mean?"));
    $("info-panel").hidden = false;
    showCandidates(out);
  } else if (out.outcome === "aggregator_only") {
    setState("error");
    const info = errorInfo("aggregator_only");
    $("error-panel").replaceChildren(h("h3", {}, info.title), h("p", {}, out.message || info.text));
    $("error-panel").hidden = false;
    showCandidates(out);
  } else {
    setState("error");
    const info = errorInfo("no_program_found");
    $("error-panel").replaceChildren(h("h3", {}, info.title), h("p", {}, out.message || info.text));
    $("error-panel").hidden = false;
  }
}

async function extract(body) {
  setState("extracting");
  $("result").replaceChildren();
  const program = await run("/api/extract", body);
  if (!program) { if (state !== "error") setState("idle"); return; }
  lastProgram = program;
  setState("done");
  drawResult();
  $("result").scrollIntoView({ block: "start", behavior: "smooth" });
}

// R-RES-9: always show what was chosen, with a way out.
function showMeant(c) {
  let host = "";
  try { host = new URL(c.official_url).hostname; } catch (e) { /* ignore */ }
  $("meant").replaceChildren(
    h("span", {}, h("strong", {}, "Is this the programme you meant? "), c.name, c.organization ? ` · ${c.organization}` : "", host ? ` · ${host}` : ""),
    h("button", { type: "button", class: "secondary", "data-action": "not-this" }, "Not this one →")
  );
  $("meant").hidden = false;
}

function showCandidates(out) {
  $("candidates").replaceChildren(
    ...out.candidates.map((c) => {
      let host = "";
      try { host = new URL(c.official_url).hostname; } catch (e) { /* ignore */ }
      return h(
        "div",
        { class: "card" },
        h("strong", {}, c.name),
        h("div", { class: "muted" }, [c.organization, c.cycle_hint, host].filter(Boolean).join(" · ")),
        h("div", {}, c.reason),
        out.outcome === "aggregator_only"
          ? h("a", { href: c.official_url, target: "_blank", rel: "noopener noreferrer" }, "Open this lead (not an official page)")
          : h("button", { type: "button", class: "primary", style: "margin-top:.4rem", "data-action": "pick", "data-url": c.official_url, "data-name": c.name, "data-org": c.organization }, "This one")
      );
    })
  );
}

// ---- result (re-drawn when the profile changes: R-UI-3, acceptance U6) ----
function drawResult() {
  if (!lastProgram) return;
  const hasProfile = isComplete(profile);
  const verdict = hasProfile ? evaluate(lastProgram, profile) : null;
  $("result").replaceChildren(renderResult(lastProgram, verdict, hasProfile));
  fillMatch();
}

// ---- shared fields with the profile (spec 04). Runs on the private lane; falls back to keyword overlap. ----
let matchSeq = 0;
const matchCache = new Map();
function programForMatch(p) {
  const val = (f) => (f && f.status !== "not_found" && f.value ? f.value : null);
  const out = {
    research_areas: val(p.research.research_areas) || [],
    fields_of_study: val(p.eligibility.fields_of_study) || [],
    problem_statement: val(p.research.problem_statement) || "",
    mentor_areas: (val(p.mentors) || []).map((m) => m.area).filter(Boolean),
  };
  return out.research_areas.length || out.fields_of_study.length || out.problem_statement || out.mentor_areas.length ? out : null;
}
async function fillMatch() {
  const slot = $("result").querySelector('[data-slot="match"]');
  if (!slot || !lastProgram) return;
  const mine = { fields_of_study: profile.fields_of_study, interests: profile.interests, skills: profile.skills, research_experience: profile.research_experience || [] };
  const hasData = mine.fields_of_study.length || mine.interests.length || mine.skills.length || mine.research_experience.length;
  const theirs = programForMatch(lastProgram);
  if (!hasData || !theirs) return; // nothing useful to compare
  const key = JSON.stringify([lastProgram.official_url, mine]);
  const my = ++matchSeq;
  if (matchCache.has(key)) { slot.replaceChildren(matchNode(...matchCache.get(key))); return; }
  slot.replaceChildren(h("p", { class: "muted" }, "Comparing with your profile…"));
  let result, note;
  try {
    result = await postJSON("/api/match", { profile: mine, program: theirs }, keyInput.value);
  } catch {
    result = keywordOverlap(mine, theirs);
    note = "(simple keyword match; the smarter match is unavailable right now)";
  }
  matchCache.set(key, [result, note]);
  if (my === matchSeq) slot.replaceChildren(matchNode(result, note));
}

// ---- events ----
$("search-form").addEventListener("submit", (e) => { e.preventDefault(); lookup($("query").value.trim()); });
$("cancel").addEventListener("click", () => controller?.abort());

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const a = t.dataset.action;
  if (a === "edit-profile") openProfile();
  else if (a === "retry") lookup(lastQuery || $("query").value.trim());
  else if (a === "not-this") {
    $("query").focus();
    $("query").select();
    $("info-panel").replaceChildren(h("p", {}, "Add more of the name (the organisation or the year), or paste the link to the programme's own page, then search again."));
    $("info-panel").hidden = false;
  } else if (a === "pick") {
    clearOutput();
    showMeant({ name: t.dataset.name, organization: t.dataset.org, official_url: t.dataset.url });
    extract({ url: t.dataset.url });
  } else if (a === "example") {
    $("query").value = t.dataset.q;
    lookup(t.dataset.q);
  }
});

$("paste-go").addEventListener("click", () => {
  const body = { pasted_text: $("paste-text").value };
  const hint = $("paste-hint").value.trim();
  if (hint) body.source_hint = hint;
  saveKey();
  $("error-panel").hidden = true;
  extract(body);
});

// ---- example chips (R-UI-8): the programmes the app was tested on ----
const EXAMPLES = ["Mitacs Globalink Research Internship", "CMU SUAMI", "SURF at IIT Gandhinagar", "Zorblax Quantum Fellowship 2027"];
$("examples").append(...EXAMPLES.map((q) => h("button", { type: "button", "data-action": "example", "data-q": q }, q)));

// ---- profile dialog ----
document.body.append(countryDatalist());
const dlg = $("profile-dialog");
const fields = {
  citizen: chipField($("f-citizen"), { countries: true, placeholder: "e.g. India" }),
  pr: chipField($("f-pr"), { countries: true, placeholder: "e.g. United States" }),
  fields: chipField($("f-fields"), { placeholder: "e.g. physics" }),
  interests: chipField($("f-interests"), { placeholder: "e.g. quantum computing" }),
  skills: chipField($("f-skills"), { placeholder: "e.g. Python" }),
};

function fillProfileForm() {
  fields.citizen.set(profile.citizenships);
  fields.pr.set(profile.permanent_residency);
  fields.fields.set(profile.fields_of_study);
  fields.interests.set(profile.interests);
  fields.skills.set(profile.skills);
  $("f-inst").value = profile.institution_country || "";
  $("f-level").value = profile.degree_level || "";
  $("f-year").value = profile.year_of_study ?? "";
  $("f-gpa").value = profile.gpa?.value ?? "";
  $("f-scale").value = profile.gpa?.scale ?? "";
  $("profile-error").textContent = "";
}

function openProfile() {
  fillProfileForm();
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}
function closeProfile() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }

function refreshProfileButton() {
  const set = isComplete(profile);
  $("profile-label").textContent = set ? summary(profile) : "Add your profile";
  $("profile-button").classList.toggle("set", set);
}

$("profile-button").addEventListener("click", openProfile);
$("profile-cancel").addEventListener("click", closeProfile);
$("profile-clear").addEventListener("click", () => {
  clearProfile();
  profile = EMPTY();
  fillProfileForm();
  refreshProfileButton();
  drawResult();
});
$("profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const year = $("f-year").value === "" ? null : Number($("f-year").value);
  const gpaVal = $("f-gpa").value === "" ? null : Number($("f-gpa").value);
  const scale = $("f-scale").value === "" ? null : Number($("f-scale").value);
  const next = {
    ...EMPTY(),
    citizenships: fields.citizen.get(),
    permanent_residency: fields.pr.get(),
    institution_country: normalizeCountry($("f-inst").value),
    degree_level: $("f-level").value,
    year_of_study: Number.isFinite(year) ? year : null,
    gpa: gpaVal !== null && scale ? { value: gpaVal, scale } : null,
    fields_of_study: fields.fields.get(),
    interests: fields.interests.get(),
    skills: fields.skills.get(),
    research_experience: pendingExperience ?? profile.research_experience ?? [],
  };
  if (gpaVal !== null && !scale) { $("profile-error").textContent = "Add what your GPA is out of (for example 10 or 4)."; return; }
  profile = next;
  saveProfile(profile);
  refreshProfileButton();
  closeProfile();
  drawResult(); // the verdict updates without another lookup
  if (!isComplete(profile)) $("profile-button").title = "Citizenship, degree level, year and institution country are needed for a verdict";
});
refreshProfileButton();

// ---- CV: read in the browser, text analysed on the private lane, result PRE-FILLS the form (R-CV-4) ----
$("cv-go").addEventListener("click", async () => {
  const status = $("cv-status");
  const set = (t) => { status.textContent = t; };
  try {
    let text = $("cv-text").value.trim();
    const file = $("cv-file").files[0];
    if (!text && file) { set("Reading the PDF in your browser…"); text = await pdfToText(file); }
    if (!text) { set("Choose a PDF or paste your CV text first."); return; }
    set("Analysing…");
    const d = await postJSON("/api/profile", { text }, keyInput.value);
    // Merge into the form; nothing is saved until the user presses Save. Citizenship is never touched (R-PRO-1).
    const merge = (field, extra) => field.set([...new Set([...field.get(), ...(extra || [])])]);
    merge(fields.fields, d.fields_of_study); merge(fields.interests, d.interests); merge(fields.skills, d.skills);
    if (d.degree_level && !$("f-level").value) $("f-level").value = d.degree_level;
    if (d.year_of_study && !$("f-year").value) $("f-year").value = d.year_of_study;
    if (d.institution_country && !$("f-inst").value) $("f-inst").value = normalizeCountry(d.institution_country);
    if (d.gpa && !$("f-gpa").value) { $("f-gpa").value = d.gpa.value; $("f-scale").value = d.gpa.scale; }
    pendingExperience = d.research_experience || null;
    $("cv-text").value = ""; $("cv-file").value = ""; // the CV text is not kept on the page
    set("Done. Check the fields below, add your citizenship, then Save.");
  } catch (e) {
    set(errorInfo(e.code).text || e.message || "Could not read that CV.");
  }
});

// ---- developer checks (from M0) ----
async function callWorker(path) {
  $("out").textContent = "Calling the Worker…";
  saveKey();
  try {
    const res = await fetch(`${WORKER_URL}${path}`, { headers: { "X-Demo-Key": keyInput.value } });
    $("out").textContent = res.status + " " + (await res.text());
  } catch (err) {
    $("out").textContent = "Could not reach the Worker: " + err.message;
  }
}
$("ping").addEventListener("click", () => callWorker("/api/ping"));
$("gemini").addEventListener("click", () => callWorker("/api/diag/gemini"));

// Test hook: lets a headless check draw a saved result without calling the Worker.
window.__reuBrief = { flush: () => fillMatch(), showProgram(p) { lastProgram = p; setState("done"); drawResult(); }, setProfile(p) { profile = { ...EMPTY(), ...p }; refreshProfileButton(); drawResult(); } };
