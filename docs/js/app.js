// REU Brief page logic (spec 06). State machine:
//   idle -> resolving -> (choosing)? -> extracting -> done      (error reachable from anywhere)
import { WORKER_URL } from "./config.js";
import { postStream } from "./api.js";
import { evaluate } from "./eligibility.js";
import { h, renderResult } from "./render.js";
import { errorInfo } from "./errors.js";
import { EMPTY, loadProfile, saveProfile, clearProfile, isComplete, summary, chipField, countryDatalist } from "./profile.js";
import { normalizeCountry } from "./eligibility.js";

const $ = (id) => document.getElementById(id);

// ---- demo key (kept for this tab only; R-UI-6) ----
const keyInput = $("demo-key");
try { keyInput.value = sessionStorage.getItem("demoKey") || ""; } catch (e) { /* storage blocked: key just isn't remembered */ }
$("key-box").hidden = Boolean(keyInput.value);
const saveKey = () => { try { sessionStorage.setItem("demoKey", keyInput.value); } catch (e) { /* ignore */ } };

// ---- state ----
let state = "idle";
let controller = null;
let timer = null;
let lastProgram = null;
let lastQuery = "";
let profile = loadProfile();

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
  try {
    await postStream(path, body, keyInput.value, (name, data) => {
      if (name === "stage") addStage(data.message);
      else if (name === "result") result = data;
      else if (name === "error") failed = data;
    }, controller.signal);
    // The stream ended without a result and without an error: the connection dropped (R-UI-7).
    if (!result && !failed) failed = { code: "network" };
  } catch (e) {
    if (e.name === "AbortError") { addStage("Cancelled."); return null; }
    failed = e;
  }
  if (failed) { showError(failed); return null; }
  return result;
}

function showError(err) {
  const info = errorInfo(err.code);
  setState("error");
  const panel = $("error-panel");
  panel.replaceChildren(h("h3", {}, info.title), h("p", {}, info.text));
  if (info.action === "retry" || info.action === "examples") {
    panel.append(h("p", {}, h("button", { type: "button", class: "secondary", "data-action": "retry" }, "Try again")));
  }
  if (info.action === "key") { $("key-box").hidden = false; keyInput.focus(); }
  if (info.action === "paste") $("paste-box").hidden = false;
  panel.hidden = false;
  if (info.action === "examples") $("examples").scrollIntoView({ block: "nearest" });
}

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

function refreshProfileButton() { $("profile-button").textContent = isComplete(profile) ? summary(profile) : "Add your profile"; }

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
window.__reuBrief = { showProgram(p) { lastProgram = p; setState("done"); drawResult(); }, setProfile(p) { profile = { ...EMPTY(), ...p }; refreshProfileButton(); drawResult(); } };
