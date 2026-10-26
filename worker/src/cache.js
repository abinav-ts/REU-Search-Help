// Workers KV cache (spec 05 R-BE-8). Free KV allows only ~1,000 writes/day, so:
// we write only finished results, never per request, and a failed write is ignored.
import { normaliseUrl } from "./links.js";

export const TTL = { resolve: 24 * 3600, page: 7 * 24 * 3600, program: 24 * 3600, prewarmed: 72 * 3600 };

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function resolveKey(query, hints) {
  return "res:" + (await sha256Hex(query.trim().toLowerCase().replace(/\s+/g, " ") + JSON.stringify(hints || {})));
}
export async function pageKey(url) {
  return "page:" + (await sha256Hex(normaliseUrl(url) || url));
}
export async function programKey(url) {
  return "prog:" + (await sha256Hex(normaliseUrl(url) || url));
}
export function creditsKey(date = new Date()) {
  return "credits:" + date.toISOString().slice(0, 7);
}

export function makeCache(env) {
  const kv = env.CACHE;
  return {
    async get(key) {
      if (!kv) return null;
      try {
        return await kv.get(key, "json");
      } catch (e) {
        console.log("cache read failed", key.slice(0, 8));
        return null;
      }
    },
    async put(key, value, ttlSeconds) {
      if (!kv) return;
      try {
        await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
      } catch (e) {
        console.log("cache write failed", key.slice(0, 8)); // ignored on purpose (R-BE-8)
      }
    },
  };
}
