/**
 * Builds data/catalog.json from curated 1980–1989 seed lists.
 * Run: node scripts/build-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const seedsDir = path.join(dataDir, "_seeds");

/** @typedef {[string, string, number, string]} Row */

const GENRE_KEYS = [
  "Pop",
  "Rock",
  "Hip-Hop / Rap",
  "R&B",
  "Electronic / Dance",
  "Jazz",
  "Country",
  "Classical",
  "Reggae",
  "Latin Music",
  "Metal",
  "Soul / Funk",
  "Indie / Alternative",
  "Blues",
  "Gospel / Christian",
  "Afrobeat / Amapiano",
  "K-Pop",
  "Folk / Acoustic",
  "Disco",
  "New Age / Ambient",
];

const MAJOR = new Set([
  "Pop",
  "Rock",
  "Hip-Hop / Rap",
  "R&B",
  "Electronic / Dance",
  "Reggae",
]);

const SEED_MAP = {
  "Pop": () => readJson(path.join(dataDir, "_pop.json")),
  "Rock": () => readJson(path.join(dataDir, "_rock.json")),
  "Hip-Hop / Rap": () => readJson(path.join(seedsDir, "hiphop.json")),
  "R&B": () => readJson(path.join(seedsDir, "rnb.json")),
  "Electronic / Dance": () => readJson(path.join(seedsDir, "electronic.json")),
  Jazz: () => readJson(path.join(seedsDir, "jazz.json")),
  Country: () => readJson(path.join(seedsDir, "country.json")),
  Classical: () => readJson(path.join(seedsDir, "classical.json")),
  Reggae: () => readJson(path.join(seedsDir, "reggae.json")),
  "Latin Music": () => readJson(path.join(seedsDir, "latin.json")),
  Metal: () => readJson(path.join(seedsDir, "metal.json")),
  "Soul / Funk": () => readJson(path.join(seedsDir, "soul-funk.json")),
  "Indie / Alternative": () => readJson(path.join(seedsDir, "indie.json")),
  Blues: () => readJson(path.join(seedsDir, "blues.json")),
  "Gospel / Christian": () => readJson(path.join(seedsDir, "gospel.json")),
  "Afrobeat / Amapiano": () => readJson(path.join(seedsDir, "afrobeat.json")),
  "K-Pop": () => readJson(path.join(seedsDir, "kpop.json")),
  "Folk / Acoustic": () => readJson(path.join(seedsDir, "folk.json")),
  Disco: () => readJson(path.join(seedsDir, "disco.json")),
  "New Age / Ambient": () => readJson(path.join(seedsDir, "ambient.json")),
};

/** @param {string} file */
function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing seed file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** @param {Row[]} rows */
function unique(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [title, artist, year, youtubeId] = row;
    if (typeof title !== "string" || typeof artist !== "string") continue;
    if (typeof year !== "number" || year < 1980 || year > 1989) continue;
    if (typeof youtubeId !== "string" || youtubeId.length < 6) continue;
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([title, artist, year, youtubeId]);
  }
  return out;
}

/** @type {Record<string, Row[]>} */
const catalog = {};

for (const key of GENRE_KEYS) {
  const loader = SEED_MAP[key];
  if (!loader) throw new Error(`No seed loader for ${key}`);
  catalog[key] = unique(loader());
}

const outPath = path.join(dataDir, "catalog.json");
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");

let ok = true;
const counts = {};
for (const key of GENRE_KEYS) {
  const n = catalog[key].length;
  counts[key] = n;
  const min = MAJOR.has(key) ? 100 : 20;
  const status = n >= min ? "OK" : "FAIL";
  if (n < min) ok = false;
  console.log(`${status.padEnd(4)} ${String(n).padStart(4)}  ${key}`);
}

console.log(`\nWrote ${outPath}`);
if (!ok) {
  console.error("\nValidation failed: majors need >= 100, all genres >= 20.");
  process.exit(1);
}
console.log("\nValidation passed.");
process.exit(0);
