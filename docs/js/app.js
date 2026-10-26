import { WORKER_URL } from "./config.js";

const keyInput = document.getElementById("demo-key");
const out = document.getElementById("out");

// sessionStorage can be unavailable (private windows etc.), so every use is wrapped.
try { keyInput.value = sessionStorage.getItem("demoKey") || ""; } catch (e) {}

document.getElementById("ping").addEventListener("click", async () => {
  out.textContent = "Calling the Worker…";
  try { sessionStorage.setItem("demoKey", keyInput.value); } catch (e) {}
  try {
    const res = await fetch(`${WORKER_URL}/api/ping`, { headers: { "X-Demo-Key": keyInput.value } });
    out.textContent = res.status + " " + (await res.text());
  } catch (err) {
    out.textContent = "Could not reach the Worker: " + err.message;
  }
});
