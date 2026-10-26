// Renders docs/index.html in headless Chrome with a saved extraction result, then screenshots it.
//   node scripts/ui-shot.mjs <fixture.json> <out.png> [width] [height] [profile=india|none|us]
// Local testing only (needs Google Chrome installed). No network, no Worker.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [fixture, out, width = "1000", height = "2400", prof = "india"] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, "..");
const tmp = process.env.TMPDIR || "/tmp";
const profiles = {
  india: { citizenships: ["India"], permanent_residency: [], institution_country: "India", degree_level: "bachelors", year_of_study: 3, gpa: { value: 8.4, scale: 10 }, fields_of_study: ["physics"], interests: [], skills: [] },
  us: { citizenships: ["United States"], permanent_residency: [], institution_country: "United States", degree_level: "bachelors", year_of_study: 2, gpa: null, fields_of_study: [], interests: [], skills: [] },
  none: {},
};
const html = fs.readFileSync(path.join(root, "docs/index.html"), "utf8")
  .replace("<head>", `<head><base href="file://${root}/docs/">`)
  .replace("</body>", `<script type="module">
    await new Promise(r => setTimeout(r, 300));
    window.__reuBrief.setProfile(${JSON.stringify(profiles[prof] || {})});
    window.__reuBrief.showProgram(${fs.readFileSync(fixture, "utf8")});
  </script></body>`);
const page = path.join(tmp, "harness.html");
fs.writeFileSync(page, html);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
try {
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--crash-dumps-dir=${path.join(tmp, "chrome-crash")}`, "--disable-breakpad", "--disable-crash-reporter", "--disable-features=Crashpad",
    `--user-data-dir=${path.join(tmp, "chrome-profile")}`, "--allow-file-access-from-files",
    `--window-size=${width},${height}`, "--virtual-time-budget=4000", `--screenshot=${out}`, `file://${page}`,
  ], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
  console.log("wrote", out);
} catch (e) {
  console.error("chrome failed:", String(e.stderr || e.message).slice(0, 600));
  process.exit(1);
}
