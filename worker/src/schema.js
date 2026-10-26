// The Program record (spec 02) as ONE table, used three ways:
//   1. modelSchema()      -> the JSON Schema we give Gemini
//   2. conforms()         -> check a value against the same table
//   3. cleanModelOutput() -> turn whatever the model sent into a well-formed record
// Every informational field is a Field<T> = {status, value, evidence, source_url}.
import { cleanField, notFound } from "./verify.js";

const str = { type: "string" };
const num = { type: "number" };
const strs = { type: "array", items: str };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties) });
const nullable = (s) => ({ anyOf: [s, { type: "null" }] });

// value schema for each field, grouped as in the spec
export const FIELD_TABLE = {
  cycle: { year: num, deadline: str },
  eligibility: {
    citizenship: obj({
      rule: { type: "string", enum: ["any", "citizens_only", "citizens_or_pr", "listed_countries", "excludes_countries", "other"] },
      countries: strs,
    }),
    career_stage: obj({
      levels: { type: "array", items: { type: "string", enum: ["bachelors", "masters", "phd", "postdoc", "other"] } },
      min_year: nullable(num), max_year: nullable(num), must_be_currently_enrolled: nullable({ type: "boolean" }),
    }),
    institution: obj({ rule: { type: "string", enum: ["any", "in_countries", "listed_institutions", "other"] }, countries: strs }),
    min_gpa: obj({ value: num, scale: num }),
    fields_of_study: strs,
    other_requirements: strs,
  },
  research: { problem_statement: str, research_areas: strs },
  application: {
    sop_count: num, recommendation_letters: num, other_documents: strs, fee: str, how_to_apply_url: str,
    prior_year_selectivity: str,
  },
  logistics: {
    duration: str, dates: str, mode: { type: "string", enum: ["in_person", "remote", "hybrid"] }, location: str,
    stipend: str, other_funding: str, travel_support: str, housing: str, visa_support: str,
  },
};
export const MENTORS_SCHEMA = {
  type: "array",
  items: obj({ name: str, affiliation: nullable(str), area: nullable(str), url: nullable(str) }),
};
const TIERS = ["private_college", "nit_niser_iiser", "iit_iisc", "foreign_university", "lab_institute", "other"];

function fieldSchema(valueSchema) {
  return obj({
    status: { type: "string", enum: ["stated", "ambiguous", "not_found"] },
    value: nullable(valueSchema),
    evidence: nullable(str),
    source_url: nullable(str),
  });
}

// The schema we hand to Gemini (responseJsonSchema).
export function modelSchema() {
  const props = {
    name: str, organization: str, tier: { type: "string", enum: TIERS }, country: str, language: str,
    extraction_notes: strs,
  };
  for (const [group, fields] of Object.entries(FIELD_TABLE)) {
    props[group] = obj(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldSchema(v)])));
  }
  props.mentors = fieldSchema(MENTORS_SCHEMA);
  return obj(props);
}

// Minimal checker for the subset of JSON Schema used above.
export function conforms(schema, v) {
  if (schema.anyOf) return schema.anyOf.some((s) => conforms(s, v));
  switch (schema.type) {
    case "null": return v === null;
    case "string": return typeof v === "string" && (!schema.enum || schema.enum.includes(v));
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "boolean": return typeof v === "boolean";
    case "array": return Array.isArray(v) && v.every((x) => conforms(schema.items, x));
    case "object":
      return v !== null && typeof v === "object" && !Array.isArray(v) &&
        Object.entries(schema.properties).every(([k, s]) => (k in v ? conforms(s, v[k]) : !schema.required?.includes(k)));
    default: return false;
  }
}

// Coerce a Field's value to its schema if it is close (e.g. "2" -> 2); else not_found.
function fitValue(valueSchema, value) {
  if (conforms(valueSchema, value)) return value;
  if (valueSchema.type === "number" && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (valueSchema.type === "string" && typeof value === "number") return String(value);
  if (valueSchema.type === "array" && valueSchema.items?.type === "string" && typeof value === "string") return [value];
  return undefined;
}

// Whatever the model sent -> every field present and well-formed. Notes collect what was dropped.
export function cleanModelOutput(raw, notes) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = {
    name: String(r.name || "").slice(0, 200),
    organization: String(r.organization || "").slice(0, 200),
    tier: TIERS.includes(r.tier) ? r.tier : "other",
    country: String(r.country || "").slice(0, 100),
    language: String(r.language || "en").slice(0, 20),
    model_notes: Array.isArray(r.extraction_notes) ? r.extraction_notes.filter((n) => typeof n === "string").map((n) => n.slice(0, 300)).slice(0, 10) : [],
  };
  const take = (f, valueSchema, label) => {
    const c = cleanField(f);
    if (c.status === "not_found") return c;
    const v = fitValue(valueSchema, c.value);
    if (v === undefined) { notes.push(`${label}: value did not fit the expected shape and was dropped`); return notFound(); }
    c.value = v;
    return c;
  };
  for (const [group, fields] of Object.entries(FIELD_TABLE)) {
    out[group] = {};
    for (const [k, vs] of Object.entries(fields)) out[group][k] = take(r[group]?.[k], vs, `${group}.${k}`);
  }
  out.mentors = take(r.mentors, MENTORS_SCHEMA, "mentors");
  return out;
}

// Every Field in a cleaned record, with a label — for verification and tests.
export function eachField(program) {
  const list = [];
  for (const group of Object.keys(FIELD_TABLE)) {
    for (const k of Object.keys(FIELD_TABLE[group])) list.push([`${group}.${k}`, program[group][k]]);
  }
  list.push(["mentors", program.mentors]);
  return list;
}
