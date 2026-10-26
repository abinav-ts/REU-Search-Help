// Eligibility engine (spec 03). Pure functions, no network, no model (H3).
// evaluate(program, profile) -> { verdict, summary, checks[] }
// The program fields are the Field<T> wrappers from spec 02: {status, value, evidence, source_url}.

// ---- Countries (R-ELG-1, R-ELG-2) ----

// canonical name -> other spellings people (and pages) use. Matching ignores case, dots and "the".
const COUNTRIES = {
  "India": ["in", "ind", "indian", "bharat", "republic of india"],
  "United States": ["us", "usa", "u s", "u s a", "united states of america", "america", "american", "us citizen", "u s citizen"],
  "United Kingdom": ["uk", "u k", "gb", "gbr", "great britain", "britain", "british", "england", "united kingdom of great britain and northern ireland"],
  "Canada": ["ca", "can", "canadian"],
  "Australia": ["au", "aus", "australian"],
  "New Zealand": ["nz", "new zealander"],
  "Germany": ["de", "deu", "german", "deutschland"],
  "France": ["fr", "fra", "french"],
  "Italy": ["it", "ita", "italian"],
  "Spain": ["es", "esp", "spanish"],
  "Portugal": ["pt", "prt", "portuguese"],
  "Netherlands": ["nl", "nld", "dutch", "holland", "the netherlands"],
  "Belgium": ["be", "bel", "belgian"],
  "Switzerland": ["ch", "che", "swiss"],
  "Austria": ["at", "aut", "austrian"],
  "Sweden": ["se", "swe", "swedish"],
  "Norway": ["no", "nor", "norwegian"],
  "Denmark": ["dk", "dnk", "danish"],
  "Finland": ["fi", "fin", "finnish"],
  "Iceland": ["is", "isl", "icelandic"],
  "Ireland": ["ie", "irl", "irish"],
  "Poland": ["pl", "pol", "polish"],
  "Czechia": ["cz", "cze", "czech republic", "czech"],
  "Hungary": ["hu", "hun", "hungarian"],
  "Greece": ["gr", "grc", "greek"],
  "Romania": ["ro", "rou", "romanian"],
  "Bulgaria": ["bg", "bgr", "bulgarian"],
  "Croatia": ["hr", "hrv", "croatian"],
  "Slovakia": ["sk", "svk", "slovak"],
  "Slovenia": ["si", "svn", "slovenian"],
  "Estonia": ["ee", "est", "estonian"],
  "Latvia": ["lv", "lva", "latvian"],
  "Lithuania": ["lt", "ltu", "lithuanian"],
  "Luxembourg": ["lu", "lux", "luxembourgish"],
  "Malta": ["mt", "mlt", "maltese"],
  "Cyprus": ["cy", "cyp", "cypriot"],
  "Liechtenstein": ["li", "lie"],
  "China": ["cn", "chn", "chinese", "prc", "peoples republic of china", "mainland china"],
  "Hong Kong": ["hk", "hkg"],
  "Taiwan": ["tw", "twn", "taiwanese"],
  "Japan": ["jp", "jpn", "japanese"],
  "South Korea": ["kr", "kor", "korea", "republic of korea", "korea republic of", "korean", "south korean"],
  "Singapore": ["sg", "sgp", "singaporean"],
  "Malaysia": ["my", "mys", "malaysian"],
  "Thailand": ["th", "tha", "thai"],
  "Vietnam": ["vn", "vnm", "viet nam", "vietnamese"],
  "Indonesia": ["id", "idn", "indonesian"],
  "Philippines": ["ph", "phl", "filipino", "philippine"],
  "Pakistan": ["pk", "pak", "pakistani"],
  "Bangladesh": ["bd", "bgd", "bangladeshi"],
  "Sri Lanka": ["lk", "lka", "sri lankan"],
  "Nepal": ["np", "npl", "nepali", "nepalese"],
  "Bhutan": ["bt", "btn", "bhutanese"],
  "Brazil": ["br", "bra", "brazilian"],
  "Mexico": ["mx", "mex", "mexican"],
  "Argentina": ["ar", "arg", "argentine", "argentinian"],
  "Chile": ["cl", "chl", "chilean"],
  "Colombia": ["co", "col", "colombian"],
  "Peru": ["pe", "per", "peruvian"],
  "Egypt": ["eg", "egy", "egyptian"],
  "South Africa": ["za", "zaf", "south african"],
  "Nigeria": ["ng", "nga", "nigerian"],
  "Kenya": ["ke", "ken", "kenyan"],
  "Ghana": ["gh", "gha", "ghanaian"],
  "Tunisia": ["tn", "tun", "tunisian"],
  "Morocco": ["ma", "mar", "moroccan"],
  "Israel": ["il", "isr", "israeli"],
  "Jordan": ["jo", "jor", "jordanian"],
  "Turkey": ["tr", "tur", "turkiye", "turkish"],
  "United Arab Emirates": ["ae", "are", "uae", "emirati"],
  "Saudi Arabia": ["sa", "sau", "saudi"],
  "Iran": ["ir", "irn", "iranian"],
  "Russia": ["ru", "rus", "russian federation", "russian"],
  "Ukraine": ["ua", "ukr", "ukrainian"],
};

const EU = ["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden"];
const EEA = [...EU, "Iceland", "Liechtenstein", "Norway"];
const GROUPS = { eu: EU, "european union": EU, eea: EEA, "european economic area": EEA };

const squash = (s) =>
  String(s ?? "").toLowerCase().replace(/[.,'’]/g, "").replace(/\s+/g, " ").replace(/^the /, "").trim();

const ALIASES = new Map();
for (const [canonical, others] of Object.entries(COUNTRIES)) {
  ALIASES.set(squash(canonical), canonical);
  for (const o of others) ALIASES.set(squash(o), canonical);
}

// R-ELG-1: aliases -> canonical English name; unknown text is returned unchanged, never throws.
export function normalizeCountry(name) {
  if (name === null || name === undefined) return "";
  const trimmed = String(name).trim();
  return ALIASES.get(squash(trimmed)) ?? trimmed;
}

// Words that mark an entry as a GROUP of countries we cannot expand (R-ELG-2).
const GROUP_WORDS = /commonwealth|developing|developed|countries|nations|region|continent|africa|asia|europe|america|oecd|g20|g7|partner|member|eligible|low[- ]income|middle[- ]income|global south|worldwide|international/i;

// -> { set: Set of canonical countries, unknownGroup: boolean }
export function expandCountries(list) {
  const set = new Set();
  let unknownGroup = false;
  for (const raw of Array.isArray(list) ? list : []) {
    const key = squash(raw);
    if (GROUPS[key]) {
      GROUPS[key].forEach((c) => set.add(c));
    } else if (ALIASES.has(key)) {
      set.add(ALIASES.get(key));
    } else if (GROUP_WORDS.test(String(raw))) {
      unknownGroup = true;
    } else {
      set.add(String(raw).trim()); // a country we don't have in the table: compare as written
    }
  }
  return { set, unknownGroup };
}

export const COUNTRY_NAMES = Object.keys(COUNTRIES);

// Every spelling we know for a country, normalised (used by the Worker to check a quote supports a list).
export function countryVariants(name) {
  const canonical = normalizeCountry(name);
  const out = new Set([squash(canonical)]);
  for (const [alias, canon] of ALIASES) if (canon === canonical && (alias.length > 2 || alias === "us" || alias === "uk")) out.add(alias);
  return [...out];
}

const names = (list) => (list || []).map(normalizeCountry).filter(Boolean);
const join = (list) => (list.length ? list.join(", ") : "none given");

// ---- One check ----

function check(criterion, result, reason, field, hard) {
  return {
    criterion,
    result, // pass | fail | unknown | n/a
    reason,
    evidence: field?.evidence ?? null,
    source_url: field?.source_url ?? null,
    hard,
  };
}

// R-ELG-4: a criterion is evaluated only when the field is "stated".
function notEvaluable(criterion, field, hard) {
  const why =
    !field || field.status === "not_found"
      ? "Not stated on the site."
      : "The site is unclear or contradicts itself on this (shown as ambiguous).";
  return check(criterion, "unknown", why, field, hard);
}

// ---- Citizenship (hard, required) ----

export function checkCitizenship(field, profile) {
  const C = "Citizenship";
  if (!field || field.status !== "stated" || !field.value) return notEvaluable(C, field, true);
  const { rule, countries } = field.value;
  const citizen = names(profile.citizenships);
  const pr = names(profile.permanent_residency);
  const { set, unknownGroup } = expandCountries(countries);
  const listed = [...set];
  const you = `you hold ${join(citizen)}${pr.length ? `; permanent residency: ${join(pr)}` : ""}`;
  const inList = (arr) => arr.some((c) => set.has(c));

  if (rule === "any") return check(C, "pass", "Open to applicants of any nationality.", field, true);
  if (rule === "other") return check(C, "unknown", "The citizenship rule is described in words the checker cannot evaluate; read the quote.", field, true);
  if (!citizen.length) return check(C, "unknown", "Add your citizenship to your profile to check this.", field, true);

  if (rule === "citizens_only") {
    if (!listed.length && !unknownGroup) return check(C, "unknown", "The countries were not listed.", field, true);
    if (inList(citizen)) return check(C, "pass", `The programme is open to citizens of ${join(listed)} (${you}).`, field, true);
    if (unknownGroup) return check(C, "unknown", "The rule names a group of countries the checker does not know; read the quote.", field, true);
    return check(C, "fail", `the programme is open to citizens of ${join(listed)} only (${you})`, field, true);
  }
  if (rule === "citizens_or_pr") {
    if (!listed.length && !unknownGroup) return check(C, "unknown", "The countries were not listed.", field, true);
    if (inList(citizen) || inList(pr)) return check(C, "pass", `The programme is open to citizens or permanent residents of ${join(listed)} (${you}).`, field, true);
    if (unknownGroup) return check(C, "unknown", "The rule names a group of countries the checker does not know; read the quote.", field, true);
    return check(C, "fail", `the programme is open to citizens or permanent residents of ${join(listed)} (${you})`, field, true);
  }
  if (rule === "listed_countries") {
    if (!listed.length && !unknownGroup) return check(C, "unknown", "The countries were not listed.", field, true);
    if (inList(citizen)) return check(C, "pass", `The programme is open to students from ${join(listed)} (${you}).`, field, true);
    if (unknownGroup) return check(C, "unknown", "The rule names a group of countries the checker does not know; read the quote.", field, true);
    return check(C, "fail", `the programme is open to students from ${join(listed)} (${you})`, field, true);
  }
  if (rule === "excludes_countries") {
    if (!listed.length && !unknownGroup) return check(C, "unknown", "The excluded countries were not listed.", field, true);
    if (inList(citizen)) return check(C, "fail", `the programme is not open to citizens of ${join(listed)} (${you})`, field, true);
    if (unknownGroup) return check(C, "unknown", "The rule excludes a group of countries the checker does not know; read the quote.", field, true);
    return check(C, "pass", `You are not in the excluded list (${join(listed)}).`, field, true);
  }
  return check(C, "unknown", "Unrecognised citizenship rule.", field, true);
}

// ---- Career stage (hard, required) ----

export function checkCareerStage(field, profile) {
  const C = "Career stage";
  if (!field || field.status !== "stated" || !field.value) return notEvaluable(C, field, true);
  const { levels = [], min_year, max_year } = field.value;
  const level = profile.degree_level;
  const year = profile.year_of_study ?? null;
  const hasBounds = (min_year ?? null) !== null || (max_year ?? null) !== null;

  let levelResult = "unknown";
  if (levels.length) levelResult = levels.includes(level) ? "pass" : "fail";
  if (levelResult === "fail") {
    return check(C, "fail", `the programme is for ${join(levels)} students (you are ${level || "not set"})`, field, true);
  }
  let yearResult = "n/a";
  if (hasBounds) {
    if (year === null) yearResult = "unknown";
    else yearResult = (min_year == null || year >= min_year) && (max_year == null || year <= max_year) ? "pass" : "fail";
  }
  const range = `year ${min_year ?? "any"} to ${max_year ?? "any"}`;
  if (yearResult === "fail") return check(C, "fail", `the programme is for ${join(levels)} students in ${range} (you are in year ${year})`, field, true);
  if (levelResult === "unknown" || yearResult === "unknown") {
    return check(C, "unknown", yearResult === "unknown" ? "Add your year of study to your profile to check the year range." : "The degree levels were not listed.", field, true);
  }
  return check(C, "pass", `Your degree level (${level}) is accepted${hasBounds ? `, and year ${year} is within ${range}` : ""}.`, field, true);
}

// ---- Institution (hard, but not required for "eligible") ----

export function checkInstitution(field, profile) {
  const C = "Institution";
  if (!field || field.status !== "stated" || !field.value) return notEvaluable(C, field, true);
  const { rule, countries } = field.value;
  if (rule === "any") return check(C, "pass", "Any institution is accepted.", field, true);
  if (rule === "in_countries") {
    const { set, unknownGroup } = expandCountries(countries);
    const mine = normalizeCountry(profile.institution_country);
    if (!set.size && !unknownGroup) return check(C, "unknown", "The countries were not listed.", field, true);
    if (!mine) return check(C, "unknown", "Add the country of your institution to your profile to check this.", field, true);
    if (set.has(mine)) return check(C, "pass", `Your institution is in ${mine}, which is accepted.`, field, true);
    if (unknownGroup) return check(C, "unknown", "The rule names a group of countries the checker does not know; read the quote.", field, true);
    return check(C, "fail", `the programme takes students from institutions in ${join([...set])} (yours is in ${mine})`, field, true);
  }
  return check(C, "unknown", "The institution rule needs a human read (a named list or other wording); see the quote.", field, true);
}

// ---- Soft criteria: never change the verdict (R-ELG-5) ----

export function checkGpa(field, profile) {
  const C = "GPA";
  if (!field || field.status !== "stated" || !field.value) return notEvaluable(C, field, false);
  const need = field.value;
  const mine = profile.gpa;
  if (!mine || !mine.scale) return check(C, "unknown", "Add your GPA to your profile to check this.", field, false);
  const rescaled = (mine.value / mine.scale) * need.scale;
  const text = `${need.value}/${need.scale} minimum; yours is ${mine.value}/${mine.scale} = ${rescaled.toFixed(2)}/${need.scale}`;
  return rescaled + 1e-9 >= need.value ? check(C, "pass", text, field, false) : check(C, "fail", text, field, false);
}

export function checkFields(field, profile) {
  const C = "Field of study";
  if (!field || field.status !== "stated" || !Array.isArray(field.value) || !field.value.length) return notEvaluable(C, field, false);
  const mine = [...(profile.fields_of_study || []), ...(profile.interests || [])].map((s) => s.toLowerCase().trim()).filter(Boolean);
  if (!mine.length) return check(C, "unknown", "Add your fields or interests to your profile to check this.", field, false);
  const theirs = field.value.map((s) => String(s).toLowerCase().trim());
  const overlap = mine.some((m) => theirs.some((t) => t.includes(m) || m.includes(t)));
  return overlap
    ? check(C, "pass", "Your fields overlap with the programme's.", field, false)
    : check(C, "fail", `No overlap between your fields and ${join(field.value)}.`, field, false);
}

// R-ELG-7: other requirements are never evaluated, only listed.
export function checkOther(field) {
  const C = "Other requirements";
  if (!field || field.status === "not_found" || !Array.isArray(field.value) || !field.value.length) return null;
  return check(C, "unknown", `Check these yourself: ${field.value.join("; ")}`, field, false);
}

// ---- Verdict (R-ELG-5, R-ELG-6) ----

function summaryFor(verdict, checks) {
  if (verdict === "not_eligible") {
    const deciding = checks.find((c) => c.hard && c.result === "fail");
    return `Not eligible: ${deciding.reason}.`;
  }
  if (verdict === "eligible") {
    return "Eligible on the rules the site states: your citizenship and career stage both meet them. Read the items marked \"also check\".";
  }
  const missing = checks.filter((c) => (c.criterion === "Citizenship" || c.criterion === "Career stage") && c.result !== "pass").map((c) => c.criterion.toLowerCase());
  return `Unclear: could not confirm ${missing.join(" and ")} from what the site states. Check the official page.`;
}

export function evaluate(program, profile) {
  const e = program?.eligibility || {};
  const citizenship = checkCitizenship(e.citizenship, profile);
  const stage = checkCareerStage(e.career_stage, profile);
  const institution = checkInstitution(e.institution, profile);
  const checks = [citizenship, stage, institution, checkGpa(e.min_gpa, profile), checkFields(e.fields_of_study, profile)];
  const other = checkOther(e.other_requirements);
  if (other) checks.push(other);
  if (e.career_stage?.status === "stated" && e.career_stage.value?.must_be_currently_enrolled) {
    checks.push(check("Enrolment", "unknown", "The programme says you must be currently enrolled. Assumed true for you.", e.career_stage, false));
  }

  let verdict;
  if (checks.some((c) => c.hard && c.result === "fail")) verdict = "not_eligible";
  else if (citizenship.result === "pass" && stage.result === "pass" && institution.result !== "fail") verdict = "eligible";
  else verdict = "unclear";

  return { verdict, summary: summaryFor(verdict, checks), checks };
}
