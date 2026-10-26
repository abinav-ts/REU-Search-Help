// Plain keyword overlap between the profile and a programme: the fallback when the model
// match is unavailable (spec 04 R-MAT-4), and also a sanity floor. Pure functions, no network.

const STOP = new Set(["and", "the", "of", "in", "for", "with", "to", "a", "an", "on", "at", "by", "from", "or", "using", "based", "research", "science", "sciences", "studies", "study", "applied", "methods", "analysis", "introduction", "advanced", "topics", "program", "programme"]);

const stem = (w) => w.replace(/(ing|ies|es|s)$/i, (m) => (m === "ies" ? "y" : "")).toLowerCase();
export const tokens = (s) =>
  String(s || "").toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);

// -> {fit, shared:[{yours, theirs, note}], gaps:[]}
export function keywordOverlap(profile, program) {
  const mine = [...(profile.fields_of_study || []), ...(profile.interests || []), ...(profile.skills || []),
    ...(profile.research_experience || []).flatMap((e) => [e.title, ...(e.topics || [])])].filter(Boolean);
  const theirs = [...(program.research_areas || []), ...(program.fields_of_study || []), ...(program.mentor_areas || [])].filter(Boolean);
  const statement = program.problem_statement || "";
  const shared = [];
  const used = new Set();
  for (const y of mine) {
    const ty = new Set(tokens(y));
    if (!ty.size) continue;
    const hit = theirs.find((t) => tokens(t).some((w) => ty.has(w))) || null;
    const inStatement = !hit && [...ty].some((w) => tokens(statement).includes(w)) ? y : null;
    const t = hit || inStatement;
    if (t && !used.has(y.toLowerCase())) {
      used.add(y.toLowerCase());
      shared.push({ yours: y, theirs: t, note: "shared keyword" });
    }
  }
  const fit = !theirs.length && !statement ? "unknown" : shared.length >= 3 ? "strong" : shared.length === 2 ? "moderate" : "weak";
  return { fit, shared: shared.slice(0, 8), gaps: [] };
}
