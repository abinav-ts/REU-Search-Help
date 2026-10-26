// Shared by scripts/local.mjs and ad-hoc checks: env from worker/.dev.vars + wrangler.toml, file-backed fake KV.
import fs from "node:fs";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "..");
export const env = {};
try {
  for (const line of fs.readFileSync(path.join(root, "worker/.dev.vars"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch { console.error("worker/.dev.vars not found"); }

// Non-secret settings come from wrangler.toml [vars] (simple line parse).
const toml = fs.readFileSync(path.join(root, "worker/wrangler.toml"), "utf8");
for (const m of toml.matchAll(/^([A-Z_]+)\s*=\s*"([^"]*)"/gm)) if (!(m[1] in env)) env[m[1]] = m[2];
env.DEMO_KEY ||= "local-test";
env.ALLOWED_ORIGIN = "http://localhost:8000";

const kvFile = path.join(root, ".local-cache/kv.json");
fs.mkdirSync(path.dirname(kvFile), { recursive: true });
let store = {};
try { store = JSON.parse(fs.readFileSync(kvFile, "utf8")); } catch { /* first run */ }
env.CACHE = {
  async get(key) {
    const e = store[key];
    if (!e || e.exp < Date.now()) return null;
    return JSON.parse(e.v);
  },
  async put(key, value, opts = {}) {
    store[key] = { v: value, exp: Date.now() + (opts.expirationTtl || 3600) * 1000 };
    fs.writeFileSync(kvFile, JSON.stringify(store));
  },
};
if (process.env.NO_CACHE) delete env.CACHE;

