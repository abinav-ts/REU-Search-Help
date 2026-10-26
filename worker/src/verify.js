// Evidence verification and cycle state, all in plain code (spec 02 R-EXT-9, R-EXT-10).
// The model writes quotes; this code checks they really occur in the text we fetched.

export function normaliseForMatch(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(words) {
  const set = new Set();
  for (let i = 0; i + 1 < words.length; i++) set.add(words[i] + " " + words[i + 1]);
  return set;
}

// Is `evidence` found in `text`? Exact (after normalising) or >= 90 % of its word pairs
// present (covers line-break and bullet artefacts). A quote made of several parts joined by
// " ‖ " (conflicting statements) needs every part to be found.
export function evidenceInText(evidence, normalisedText, textBigrams) {
  if (!evidence) return false;
  const parts = String(evidence).split(/‖|\.{3}|…/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => {
    const n = normaliseForMatch(part);
    if (!n) return false;
    if (normalisedText.includes(n)) return true;
    const words = n.split(" ");
    if (words.length < 4) return false; // too short for fuzzy matching: must be exact
    const grams = [...bigrams(words)];
    let hit = 0;
    for (const g of grams) if (textBigrams.has(g)) hit++;
    return hit / grams.length >= 0.9;
  });
}

// Prepare once per page set, then check many fields. Returns evidence -> true/false.
export function makeEvidenceChecker(texts) {
  const locate = makeLocator(texts);
  return (evidence) => locate(evidence).found;
}

// Like the checker, but also says WHICH page the quote is on (index into `texts`), so the
// source link comes from code, not from the model. For a multi-part quote the index is
// that of the first part.
export function makeLocator(texts) {
  const pages = texts.map((t) => {
    const n = normaliseForMatch(t);
    return { n, grams: bigrams(n.split(" ")) };
  });
  return (evidence) => {
    const parts = String(evidence ?? "").split(/\u2016|\.{3}|\u2026/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return { found: false, index: -1 };
    let firstIndex = -1;
    for (const part of parts) {
      const idx = pages.findIndex((pg) => evidenceInText(part, pg.n, pg.grams));
      if (idx === -1) return { found: false, index: -1 };
      if (firstIndex === -1) firstIndex = idx;
    }
    return { found: true, index: firstIndex };
  };
}

// Field<T> helpers ------------------------------------------------------------

export function notFound() {
  return { status: "not_found", value: null, evidence: null, source_url: null };
}

// Make any model output a well-formed Field: unknown statuses become not_found, a "stated"
// field with no value becomes not_found, a not_found field is emptied.
export function cleanField(f) {
  if (!f || typeof f !== "object") return notFound();
  let status = ["stated", "ambiguous", "not_found"].includes(f.status) ? f.status : "not_found";
  let value = f.value === undefined ? null : f.value;
  if (Array.isArray(value) && value.length === 0) value = null;
  if (value === null || value === "") status = "not_found";
  if (status === "not_found") return notFound();
  const evidence = typeof f.evidence === "string" && f.evidence.trim() ? f.evidence.trim().slice(0, 480) : null;
  const source_url = typeof f.source_url === "string" && f.source_url ? f.source_url : null;
  return { status, value, evidence, source_url };
}

// R-EXT-9: every "stated" field must have a quote that is really in the fetched text;
// otherwise it is downgraded to "ambiguous" and flagged. Returns a list of notes.
export function verifyField(field, check, label, notes) {
  if (field.status !== "stated") return field;
  const ok = check(field.evidence);
  field.evidence_verified = ok;
  if (!ok) {
    field.status = "ambiguous";
    notes.push(`${label}: quote could not be matched on the fetched page`);
  }
  return field;
}

// R-EXT-10: cycle state from the deadline and year, using today's date, never the model.
export function computeCycleState(deadlineIso, year, today = new Date()) {
  const notes = [];
  let state = "unknown";
  const d = deadlineIso && /^\d{4}-\d{2}-\d{2}/.test(deadlineIso) ? new Date(deadlineIso.slice(0, 10) + "T23:59:59Z") : null;
  if (d && !Number.isNaN(d.getTime())) state = d.getTime() < today.getTime() ? "closed" : "upcoming";
  if (typeof year === "number" && year < today.getUTCFullYear()) notes.push("page may describe a previous cycle");
  return { state, notes };
}

// A list of countries must not contain more than its quote supports. Drops countries whose name
// (or a known alias) is not in the evidence text. `variants(name)` -> array of normalised spellings.
// Returns the removed names.
export function pruneUnsupportedCountries(countries, evidence, variants) {
  const text = " " + normaliseForMatch(evidence) + " ";
  const kept = [];
  const removed = [];
  for (const c of countries) {
    const supported = variants(c).some((v) => v && text.includes(" " + normaliseForMatch(v) + " "));
    (supported ? kept : removed).push(c);
  }
  return { kept, removed };
}

// ---- Conflicting country lists across pages (code-side check; the model often misses these) ----

// ---- CPU note: the free Workers plan allows ~10 ms of CPU per request, so the scan below builds
// ONE lookup table (spelling -> country) and then checks each sentence word-by-word (a few Map
// lookups per word) instead of testing every spelling of every country against every sentence.
const scanners = new Map();
function scannerFor(allCountries, variants) {
  const key = allCountries;
  if (scanners.has(key)) return scanners.get(key);
  const table = new Map(); // normalised spelling -> canonical country
  let maxWords = 1;
  for (const c of allCountries) {
    for (const v of variants(c)) {
      const n = normaliseForMatch(v);
      if (!n) continue;
      const w = n.split(" ").length;
      if (w > 4) continue; // the very long official names are never written out in lists
      maxWords = Math.max(maxWords, w);
      if (!table.has(n)) table.set(n, c);
    }
  }
  const scan = (sentence) => {
    const words = normaliseForMatch(sentence).split(" ");
    const found = new Set();
    for (let i = 0; i < words.length; i++) {
      for (let n = 1; n <= maxWords && i + n <= words.length; n++) {
        const c = table.get(words.slice(i, i + n).join(" "));
        if (c) found.add(c);
      }
    }
    return [...found];
  };
  scanners.set(key, scan);
  return scan;
}

// Which known countries does this sentence name? `allCountries` = canonical names,
// `variants(name)` = spellings of one country. Result is in the order of `allCountries`.
export function countriesInSentence(sentence, allCountries, variants) {
  const found = new Set(scannerFor(allCountries, variants)(sentence));
  return allCountries.filter((c) => found.has(c));
}

// pages: [{url, text}]. Per page take the sentence that names the most countries (>= minCountries);
// if two pages name different sets, return {a:{url,sentence,countries}, b:{...}}, else null.
export function countryListConflict(pages, allCountries, variants, minCountries = 5) {
  const best = [];
  for (const p of pages) {
    let top = null;
    for (const raw of String(p.text || "").split(/(?<=[.!?])\s+|\n+/)) {
      if (raw.length < 20 || raw.length > 1500) continue;
      if ((raw.match(/,| and /g) || []).length < minCountries - 2) continue; // a list of countries has separators
      const countries = countriesInSentence(raw, allCountries, variants);
      if (countries.length >= minCountries && (!top || countries.length > top.countries.length)) top = { url: p.url, sentence: raw.trim(), countries };
    }
    if (top) best.push(top);
  }
  for (let i = 0; i < best.length; i++) {
    for (let j = i + 1; j < best.length; j++) {
      const a = new Set(best[i].countries);
      const same = a.size === best[j].countries.length && best[j].countries.every((c) => a.has(c));
      if (!same) return { a: best[i], b: best[j] };
    }
  }
  return null;
}

// Rule "any" (open to every nationality) is a strong claim. Accept it only when the quote says so
// in plain words; "you are welcome to apply" in answer to one person's question is not enough.
const ANY_WORDING = /\b(all|any|every)\s+(nationalit|countr|citizen)|regardless of\s+(your\s+)?(nationality|citizenship|country)|irrespective of\s+(nationality|citizenship|country)|international (students|applicants) (are )?(welcome|eligible|encouraged)|open to (all|international)|no (nationality|citizenship) (restriction|requirement)|worldwide/i;
export function anyRuleSupported(evidence) {
  return ANY_WORDING.test(String(evidence ?? ""));
}
