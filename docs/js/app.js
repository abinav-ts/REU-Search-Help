import { WORKER_URL } from "./config.js";

const keyInput = document.getElementById("demo-key");
const out = document.getElementById("out");

// sessionStorage can be unavailable (private windows etc.), so every use is wrapped.
try { keyInput.value = sessionStorage.getItem("demoKey") || ""; } catch (e) {}

// Calls one Worker endpoint with the demo key and shows the raw reply.
async function callWorker(path) {
  out.textContent = "Calling the Worker…";
  try { sessionStorage.setItem("demoKey", keyInput.value); } catch (e) {}
  try {
    const res = await fetch(`${WORKER_URL}${path}`, { headers: { "X-Demo-Key": keyInput.value } });
    out.textContent = res.status + " " + (await res.text());
  } catch (err) {
    out.textContent = "Could not reach the Worker: " + err.message;
  }
}

document.getElementById("ping").addEventListener("click", () => callWorker("/api/ping"));
// One tiny Gemini call made by the Worker with its own key (spec 05 /diag/gemini).
document.getElementById("gemini").addEventListener("click", () => callWorker("/api/diag/gemini"));
