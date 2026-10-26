// M1 page: search -> (pick) -> extract -> raw JSON. Styling and the full result layout come in M4 (spec 06).
import { WORKER_URL } from "./config.js";
import { postStream } from "./api.js";

const $ = (id) => document.getElementById(id);
const keyInput = $("demo-key");

// sessionStorage can be unavailable (private windows etc.), so every use is wrapped.
try { keyInput.value = sessionStorage.getItem("demoKey") || ""; } catch (e) {}
const saveKey = () => { try { sessionStorage.setItem("demoKey", keyInput.value); } catch (e) {} };

let controller = null;

function reset() {
  $("progress").innerHTML = "";
  $("message").textContent = "";
  $("candidates").innerHTML = "";
  $("paste-box").hidden = true;
  $("result").hidden = true;
  $("result-title").hidden = true;
}

function busy(on) {
  $("go").disabled = on;
  $("cancel").hidden = !on;
}

function addStage(text) {
  const li = document.createElement("li");
  li.textContent = text; // textContent, never innerHTML: the text may contain page-derived words
  $("progress").appendChild(li);
}

// Run one streaming call; returns the `result` payload or null (after showing an error).
async function run(path, body) {
  controller = new AbortController();
  busy(true);
  let result = null;
  try {
    await postStream(path, body, keyInput.value, (name, data) => {
      if (name === "stage") addStage(data.message);
      else if (name === "result") result = data;
      else if (name === "error") showError(data);
    }, controller.signal);
  } catch (e) {
    if (e.name === "AbortError") addStage("Cancelled.");
    else showError(e);
  } finally {
    busy(false);
  }
  return result;
}

function showError(err) {
  $("message").textContent = err.message || "Something went wrong.";
  // The paste-text fallback is offered when the site can't be read (spec 02 R-EXT-12).
  if (["blocked", "js_required"].includes(err.code)) $("paste-box").hidden = false;
}

function showResult(obj) {
  $("result-title").hidden = false;
  $("result").hidden = false;
  $("result").textContent = JSON.stringify(obj, null, 2);
}

async function extract(body) {
  const program = await run("/api/extract", body);
  if (program) showResult(program);
}

function showCandidates(out) {
  $("candidates").innerHTML = "";
  for (const c of out.candidates) {
    const div = document.createElement("div");
    div.className = "card";
    const title = document.createElement("strong");
    title.textContent = c.name;
    const line = document.createElement("div");
    line.className = "muted";
    line.textContent = [c.organization, c.cycle_hint, new URL(c.official_url).hostname].filter(Boolean).join(" · ");
    const why = document.createElement("div");
    why.textContent = c.reason;
    div.append(title, line, why);
    if (out.outcome === "aggregator_only") {
      const a = document.createElement("a");
      a.href = c.official_url; a.textContent = "Open this lead (not an official page)"; a.target = "_blank"; a.rel = "noopener";
      div.append(a);
    } else {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "This one";
      b.addEventListener("click", () => { reset(); extract({ url: c.official_url }); });
      div.append(b);
    }
    $("candidates").appendChild(div);
  }
}

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  saveKey();
  reset();
  const out = await run("/api/resolve", { query: $("query").value });
  if (!out) return;
  if (out.outcome === "single") {
    addStage(`Found: ${out.candidates[0].name} (${new URL(out.candidates[0].official_url).hostname})`);
    await extract({ url: out.candidates[0].official_url });
  } else if (out.outcome === "multiple") {
    $("message").textContent = "Several programmes match. Which one do you mean?";
    showCandidates(out);
  } else {
    $("message").textContent = out.message || "No official page found.";
    if (out.outcome === "aggregator_only") showCandidates(out);
  }
});

$("cancel").addEventListener("click", () => controller?.abort());
$("paste-go").addEventListener("click", () => {
  const body = { pasted_text: $("paste-text").value };
  if ($("paste-hint").value.trim()) body.source_hint = $("paste-hint").value.trim();
  $("message").textContent = "";
  extract(body);
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
