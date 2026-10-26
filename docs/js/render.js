// Result page rendering (spec 06). Everything from the Worker is inserted as TEXT (R-UI-4),
// never as HTML, and only https: links become links.

// h("div", {class: "x"}, "text", childNode) -> element. Strings become text nodes.
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return node;
}

// Only https: URLs are links; anything else is shown as plain text.
export function safeLink(url, text, cls) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return h("a", { href: u.toString(), target: "_blank", rel: "noopener noreferrer", class: cls }, text ?? u.hostname);
  } catch { /* not a URL */ }
  return h("span", { class: cls }, text ?? String(url));
}

// ---- value formatting ----

const LEVELS = { bachelors: "bachelor's", masters: "master's", phd: "PhD", postdoc: "postdoc", other: "other" };
const list = (a) => a.join(", ");

export const FORMAT = {
  citizenship(v) {
    const c = list(v.countries || []);
    switch (v.rule) {
      case "any": return "Open to applicants of any nationality";
      case "citizens_only": return `Citizens of ${c || "(countries not listed)"} only`;
      case "citizens_or_pr": return `Citizens or permanent residents of ${c || "(countries not listed)"}`;
      case "listed_countries": return `Students from: ${c || "(countries not listed)"}`;
      case "excludes_countries": return `Open to all except citizens of: ${c || "(countries not listed)"}`;
      default: return c ? `Special rule (countries mentioned: ${c}); read the quote` : "Special rule; read the quote";
    }
  },
  career_stage(v) {
    const bits = [];
    if (v.levels?.length) bits.push(v.levels.map((l) => LEVELS[l] || l).join(" or ") + " students");
    if (v.min_year != null || v.max_year != null) bits.push(`year ${v.min_year ?? "any"} to ${v.max_year ?? "any"}`);
    if (v.must_be_currently_enrolled) bits.push("must be currently enrolled");
    return bits.join(", ") || "See quote";
  },
  institution(v) {
    if (v.rule === "any") return "Any institution";
    if (v.rule === "in_countries") return `Institution in: ${list(v.countries || [])}`;
    if (v.rule === "listed_institutions") return "Only listed institutions; read the quote";
    return "Special rule; read the quote";
  },
  min_gpa: (v) => `Minimum ${v.value} on a ${v.scale}-point scale`,
  mode: (v) => ({ in_person: "In person", remote: "Remote", hybrid: "Hybrid" }[v] || String(v)),
  array: (v) => v.join("; "),
  text: (v) => String(v),
};

const MARK = { stated: { icon: "✓", label: "Stated on the site" }, ambiguous: { icon: "⚠", label: "Unclear or conflicting" } };

// One fact: label, value, status marker, source link, and the quote(s) behind it.
export function factNode(label, field, format = FORMAT.text, { wide = false } = {}) {
  const m = MARK[field.status];
  const quotes = (field.evidence || "").split("‖").map((q) => q.trim()).filter(Boolean);
  const unverified = field.evidence_verified === false;
  return h(
    "div",
    { class: "fact" + (wide ? " wide" : "") + (field.status === "ambiguous" ? " ambiguous" : "") },
    h("div", { class: "fact-label" }, label),
    h("div", { class: "fact-value" }, format(field.value)),
    h(
      "div",
      { class: "fact-meta" },
      h("span", { class: "mark", title: m.label, "aria-label": m.label }, m.icon + " " + (field.status === "stated" ? "stated" : "unclear")),
      field.source_url ? safeLink(field.source_url, "source", "source") : null,
      unverified ? h("span", { class: "note" }, "Quote could not be matched on the page") : null
    ),
    quotes.length
      ? h(
          "details",
          { class: "quote" },
          h("summary", {}, quotes.length > 1 ? `Quotes (${quotes.length})` : "Quote"),
          quotes.map((q) => h("blockquote", {}, q))
        )
      : null
  );
}

// ---- sections ----

const TIER = { private_college: "Private college", nit_niser_iiser: "NIT / NISER / IISER", iit_iisc: "IIT / IISc", foreign_university: "Foreign university", lab_institute: "Lab / institute", other: "" };
const STATE = { open: ["open", "Applications open"], upcoming: ["upcoming", "Upcoming"], closed: ["closed", "Closed"], unknown: ["unknown", "Dates unclear"] };

function titleBlock(p) {
  const [stateCls, stateText] = STATE[p.cycle?.state] || STATE.unknown;
  const dl = p.cycle?.deadline;
  const deadline = dl?.status !== "not_found" ? `Deadline ${dl.value}` : "Deadline not stated";
  const year = p.cycle?.year?.status !== "not_found" ? `Cycle ${p.cycle.year.value}` : null;
  const stale = (p.meta?.extraction_notes || []).some((n) => /previous cycle/i.test(n));
  return h(
    "section",
    { class: "title-block" },
    h("h2", {}, p.name || "Programme"),
    h("p", { class: "muted" }, [p.organization, TIER[p.tier], p.country].filter(Boolean).join(" · ")),
    h(
      "p",
      { class: "chips" },
      year ? h("span", { class: "chip" }, year) : null,
      h("span", { class: "chip" }, deadline),
      h("span", { class: `chip state-${stateCls}` }, stateText)
    ),
    stale ? h("p", { class: "warn" }, "⚠ This page may describe a previous year's cycle. Check the dates on the official page.") : null,
    p.official_url ? h("p", {}, safeLink(p.official_url, "Open the official page", "button-link"), " ", h("span", { class: "muted" }, "· verify everything on the official site")) : null
  );
}

const RESULT_ICON = { pass: "✓", fail: "✗", unknown: "?", "n/a": "–" };

export function verdictNode(verdict, hasProfile, onEditProfile) {
  if (!hasProfile) {
    return h(
      "section",
      { class: "verdict verdict-none", "aria-live": "polite" },
      h("h3", {}, "Add your profile to get an eligibility verdict"),
      h("p", {}, "Eligibility is checked in your browser against what the site states. Your profile is never sent to our server."),
      h("button", { type: "button", class: "primary", onclick: null, "data-action": "edit-profile" }, "Add your profile")
    );
  }
  const titles = { eligible: "Eligible on the stated rules", not_eligible: "Not eligible", unclear: "Unclear" };
  const icons = { eligible: "✓", not_eligible: "✗", unclear: "?" };
  const deciding =
    verdict.checks.find((c) => c.hard && c.result === "fail") ||
    (verdict.verdict === "unclear" ? verdict.checks.find((c) => c.hard && c.result === "unknown" && c.evidence) : null);
  const alsoCheck = verdict.checks.filter((c) => c.result === "unknown" || (!c.hard && c.result === "fail"));
  return h(
    "section",
    { class: `verdict verdict-${verdict.verdict}`, "aria-live": "polite" },
    h("h3", {}, h("span", { class: "verdict-icon", "aria-hidden": "true" }, icons[verdict.verdict]), " ", titles[verdict.verdict]),
    h("p", { class: "verdict-summary" }, verdict.summary),
    deciding?.evidence
      ? h("blockquote", {}, deciding.evidence.split("‖").map((q) => q.trim()).filter(Boolean).join("  ‖  "), " ", deciding.source_url ? safeLink(deciding.source_url, "source", "source") : null)
      : null,
    h(
      "details",
      { class: "how" },
      h("summary", {}, "How this was decided"),
      h(
        "ul",
        { class: "checks" },
        verdict.checks.map((c) =>
          h(
            "li",
            { class: `check-${c.result}` },
            h("span", { class: "check-icon", "aria-hidden": "true" }, RESULT_ICON[c.result]),
            h("strong", {}, c.criterion + (c.hard ? "" : " (informational)") + ": "),
            c.reason
          )
        )
      )
    ),
    alsoCheck.length
      ? h("p", { class: "also-check" }, h("strong", {}, "Also check: "), alsoCheck.map((c) => c.criterion).join(", "))
      : null,
    h("button", { type: "button", class: "link-button", "data-action": "edit-profile" }, "Change my profile")
  );
}

// Grid of facts shown "at a glance" (spec 06 screen 5.3).
function glance(p) {
  const rows = [
    ["Problem statement", p.research.problem_statement, FORMAT.text, true],
    ["Research areas", p.research.research_areas, FORMAT.array],
    ["Statements of purpose", p.application.sop_count, FORMAT.text],
    ["Recommendation letters", p.application.recommendation_letters, FORMAT.text],
    ["Other documents", p.application.other_documents, FORMAT.array],
    ["Programme dates", p.logistics.dates, FORMAT.text],
    ["Duration", p.logistics.duration, FORMAT.text],
    ["Stipend", p.logistics.stipend, FORMAT.text],
    ["Other funding", p.logistics.other_funding, FORMAT.text],
    ["Travel support", p.logistics.travel_support, FORMAT.text],
    ["Housing", p.logistics.housing, FORMAT.text],
    ["Visa / letter support", p.logistics.visa_support, FORMAT.text],
    ["Format", p.logistics.mode, FORMAT.mode],
    ["Location", p.logistics.location, FORMAT.text],
    ["Application fee", p.application.fee, FORMAT.text],
    ["How to apply", p.application.how_to_apply_url, FORMAT.text],
    ["Selection statistics", p.application.prior_year_selectivity, FORMAT.text],
  ];
  return rows.map(([label, f, fmt, wide]) => ({ label, f, fmt, wide }));
}

function eligibilityFacts(p) {
  const e = p.eligibility;
  return [
    { label: "Citizenship", f: e.citizenship, fmt: FORMAT.citizenship },
    { label: "Career stage", f: e.career_stage, fmt: FORMAT.career_stage },
    { label: "Institution", f: e.institution, fmt: FORMAT.institution },
    { label: "Minimum GPA", f: e.min_gpa, fmt: FORMAT.min_gpa },
    { label: "Fields of study", f: e.fields_of_study, fmt: FORMAT.array },
    { label: "Other requirements", f: e.other_requirements, fmt: FORMAT.array },
  ];
}

function mentorsNode(f) {
  if (f.status === "not_found") return null;
  return h(
    "section",
    { class: "mentors" },
    h("h3", {}, "Mentors"),
    h(
      "ul",
      {},
      f.value.map((m) =>
        h("li", {}, h("strong", {}, m.name), [m.affiliation, m.area].filter(Boolean).length ? " — " + [m.affiliation, m.area].filter(Boolean).join(", ") : "", m.url ? [" ", safeLink(m.url, "link")] : null)
      )
    ),
    h("p", { class: "fact-meta" }, h("span", { class: "mark" }, f.status === "stated" ? "✓ stated" : "⚠ unclear"), f.source_url ? safeLink(f.source_url, "source", "source") : null)
  );
}

function sourcesNode(p) {
  const m = p.meta || {};
  return h(
    "section",
    { class: "sources" },
    h("h3", {}, "Sources"),
    h(
      "ul",
      {},
      (m.pages_read || []).map((pg) => h("li", { class: pg.ok ? "" : "failed" }, (pg.ok ? "Read: " : "Could not read: "), pg.url ? safeLink(pg.url, pg.url.replace(/^https?:\/\//, "").slice(0, 80)) : "pasted text", ` (${pg.kind})`))
    ),
    h("p", { class: "muted" }, `Fetched ${m.fetched_at ? new Date(m.fetched_at).toLocaleString() : "?"}${m.from_cache ? " (saved copy under 24 hours old)" : ""}. Programme terms change; verify on the official site.`),
    m.extraction_notes?.length
      ? h("details", {}, h("summary", {}, "Notes from the reading"), h("ul", {}, m.extraction_notes.map((n) => h("li", {}, n))))
      : null
  );
}

// The whole result. `verdict` is null when the profile is incomplete.
export function renderResult(program, verdict, hasProfile) {
  const shown = (items, wideDefault = false) => items.filter((x) => x.f.status !== "not_found" && !(x.f.value == null));
  const eg = eligibilityFacts(program);
  const gl = glance(program);
  const missing = [...eg, ...gl, { label: "Mentors", f: program.mentors }, { label: "Deadline", f: program.cycle.deadline }]
    .filter((x) => x.f.status === "not_found")
    // selectivity is optional: never listed as missing (spec 06)
    .filter((x) => x.label !== "Selection statistics")
    .map((x) => x.label);

  return h(
    "article",
    { class: "result" },
    titleBlock(program),
    verdictNode(verdict, hasProfile),
    h("section", { "data-slot": "match" }),
    h("section", {}, h("h3", {}, "Eligibility, as the site states it"), h("div", { class: "grid" }, shown(eg).map((x) => factNode(x.label, x.f, x.fmt)))),
    h("section", {}, h("h3", {}, "At a glance"), h("div", { class: "grid" }, shown(gl).map((x) => factNode(x.label, x.f, x.fmt, { wide: x.wide })))),
    mentorsNode(program.mentors),
    missing.length
      ? h("section", { class: "not-stated" }, h("h3", {}, "Not stated on the site"), h("p", { class: "muted" }, missing.join(" · ")))
      : null,
    sourcesNode(program)
  );
}

// "Shared with your profile" (spec 04). `match` = {fit, shared[], gaps[], message?}; `note` explains a fallback.
export function matchNode(match, note) {
  const FIT = { strong: "Strong overlap", moderate: "Some overlap", weak: "Little overlap found", unknown: "Not enough information" };
  return h(
    "div",
    { class: "match" },
    h("h3", {}, "Shared with your profile"),
    h("p", {}, h("span", { class: "chip" }, FIT[match.fit] || FIT.unknown), note ? h("span", { class: "muted" }, " " + note) : null),
    match.message ? h("p", { class: "muted" }, match.message) : null,
    match.shared?.length
      ? h("ul", { class: "shared" }, match.shared.map((p) => h("li", {}, h("strong", {}, p.yours), " ↔ ", h("strong", {}, p.theirs), p.note ? h("span", { class: "muted" }, " — " + p.note) : null)))
      : null,
    match.gaps?.length ? h("p", { class: "muted" }, "The programme also mentions: " + match.gaps.join("; ")) : null
  );
}
