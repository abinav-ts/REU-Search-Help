// The user's profile (spec 04 "Profile form"). Kept ONLY in this browser (localStorage, R-PRO-2).
// Nationality and similar details are asked, never inferred from a CV (R-PRO-1).
import { normalizeCountry, COUNTRY_NAMES } from "./eligibility.js";
import { h } from "./render.js";

const KEY = "reuBriefProfile";

export const EMPTY = () => ({
  citizenships: [], permanent_residency: [], institution_country: "", degree_level: "",
  year_of_study: null, gpa: null, fields_of_study: [], interests: [], skills: [], research_experience: [],
});

// localStorage can be blocked (private windows, strict settings): every use is wrapped.
export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY(), ...JSON.parse(raw) } : EMPTY();
  } catch { return EMPTY(); }
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* page still works */ } }
export function clearProfile() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }

// R-PRO-3: the four fields needed for a verdict.
export function isComplete(p) {
  return Boolean(p.citizenships?.length && p.degree_level && p.year_of_study != null && p.institution_country);
}

export function summary(p) {
  if (!isComplete(p)) return "Add your profile";
  const lv = { bachelors: "Bachelor's", masters: "Master's", phd: "PhD", other: "Other" }[p.degree_level] || p.degree_level;
  return `${p.citizenships.join(", ")} · ${lv} year ${p.year_of_study}`;
}

// A small "type, press Enter, get a chip" control. countries=true adds the country typeahead (R-PRO-4).
export function chipField(root, { countries = false, placeholder = "" } = {}) {
  let items = [];
  const chips = h("span", { class: "chip-list" });
  const input = h("input", { type: "text", placeholder, autocomplete: "off", list: countries ? "country-list" : null });
  const add = () => {
    let v = input.value.trim();
    if (!v) return;
    if (countries) v = normalizeCountry(v);
    if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) items.push(v);
    input.value = "";
    draw();
  };
  const draw = () => {
    chips.replaceChildren(
      ...items.map((it, i) =>
        h("span", { class: "chip removable" }, it, h("button", { type: "button", "aria-label": `Remove ${it}`, onclick: null, "data-i": i }, "×"))
      )
    );
    chips.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { items.splice(Number(b.dataset.i), 1); draw(); })
    );
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  input.addEventListener("change", add);
  root.append(chips, input);
  return { get: () => { add(); return [...items]; }, set: (list) => { items = [...list]; draw(); } };
}

export function countryDatalist() {
  return h("datalist", { id: "country-list" }, COUNTRY_NAMES.map((c) => h("option", { value: c })));
}
