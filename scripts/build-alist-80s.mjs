/**
 * Builds data/_curated/alist-80s.json
 * Run: node scripts/build-alist-80s.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const outDir = path.join(dataDir, "_curated");
const cachePath = path.join(outDir, ".yt-cache.json");

const FAKE = /xRockPad|xPopPad|aAfr80s|mN8kYqL3VxY|_vK5m|YqL\d|Qm[A-Z0-9]{2,}[A-Z]/i;

/** @typedef {[string, string, number, string]} Row */
/** @typedef {[string, string, number]} Song */

const GENRES = [
  "Pop", "Rock", "Hip-Hop / Rap", "R&B", "Electronic / Dance",
  "Jazz", "Country", "Classical", "Reggae", "Latin Music",
  "Metal", "Soul / Funk", "Indie / Alternative", "Blues",
  "Gospel / Christian", "Afrobeat / Amapiano", "K-Pop",
  "Folk / Acoustic", "Disco", "New Age / Ambient",
];

const MAJOR = new Set(["Pop", "Rock", "Hip-Hop / Rap", "R&B", "Electronic / Dance", "Reggae"]);

const POP_TRIM = new Set([
  "i've been losing you|a-ha", "pale shelter|tears for fears",
  "miss me blind|culture club", "it's a miracle|culture club",
  "church of the poison mind|culture club", "thorn in my side|eurythmics",
  "missionary man|eurythmics", "take me home|phil collins",
  "a matter of trust|billy joel", "alive and kicking|simple minds",
  "these dreams|heart", "maniac|michael sembello",
  "who can it be now?|men at work", "hunting high and low|a-ha",
  "i just can't stop loving you|michael jackson", "monkey|george michael",
  "one more try|george michael", "i want your sex|george michael",
  "where do broken hearts go|whitney houston", "didn't we almost have it all|whitney houston",
  "so emotional|whitney houston", "wanna be startin' somethin'|michael jackson",
  "p.y.t. (pretty young thing)|michael jackson", "human nature|michael jackson",
  "sign o' the times|prince", "u got the look|prince",
  "opportunities (let's make lots of money)|pet shop boys",
  "what have i done to deserve this?|pet shop boys", "always on my mind|pet shop boys",
  "sussudio|phil collins", "a groovy kind of love|phil collins",
  "the river of dreams|billy joel", "glory days|bruce springsteen",
  "new sensation|inxs", "we built this city|starship",
  "is there something i should know?|duran duran", "the wild boys|duran duran",
  "notorious|duran duran", "change of heart|cyndi lauper",
  "she bop|cyndi lauper", "all through the night|cyndi lauper",
  "freedom|wham!", "i'm your man|wham!", "everything she wants|wham!",
  "who's that girl|madonna", "express yourself|madonna", "cherish|madonna",
  "open your heart|madonna", "live to tell|madonna", "crazy for you|madonna",
  "lucky star|madonna", "borderline|madonna",
]);

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function isRealId(id) { return typeof id === "string" && id.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(id) && !FAKE.test(id); }

/** @param {Row[]} rows */
function unique(rows) {
  const seen = new Set();
  const out = [];
  for (const [title, artist, year, youtubeId] of rows) {
    if (year < 1980 || year > 1989 || !isRealId(youtubeId)) continue;
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([title, artist, year, youtubeId]);
  }
  return out;
}

/** @type {Record<string, string>} */
let cache = fs.existsSync(cachePath) ? readJson(cachePath) : {};

/** @param {string} q @param {number} tries */
async function ytSearch(q, tries = 5) {
  if (cache[q]) return cache[q];
  for (let i = 0; i < tries; i++) {
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      const r = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      const t = await r.text();
      const ids = [
        ...t.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g),
      ].map((m) => m[1]);
      const id = ids[0] ?? null;
      if (id) {
        cache[q] = id;
        return id;
      }
    } catch {
      if (i === tries - 1) console.warn(`search failed: ${q}`);
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  return null;
}

/** @param {Song[]} songs @param {number} n */
async function resolve(songs, n = 1) {
  const filtered = songs.filter(([, , year]) => year >= 1980 && year <= 1989);
  /** @type {Row[]} */
  const out = [];
  for (let i = 0; i < filtered.length; i += n) {
    const batch = filtered.slice(i, i + n);
    for (const [title, artist, year] of batch) {
      const id = await ytSearch(`${artist} ${title} official video`);
      if (id) out.push([title, artist, year, id]);
    }
    if (i % 20 === 0) fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    await new Promise((res) => setTimeout(res, 300));
  }
  return out;
}

// Load genre seed lists
const seeds = readJson(path.join(__dirname, "alist-80s-seeds.json"));
const seedsDir = path.join(dataDir, "_seeds");
const SEED_FILES = {
  "Hip-Hop / Rap": "hiphop.json",
  "R&B": "rnb.json",
  "Electronic / Dance": "electronic.json",
  Jazz: "jazz.json",
  Country: "country.json",
  Classical: "classical.json",
  Reggae: "reggae.json",
  "Latin Music": "latin.json",
  Metal: "metal.json",
  "Soul / Funk": "soul-funk.json",
  "Indie / Alternative": "indie.json",
  Blues: "blues.json",
  "Gospel / Christian": "gospel.json",
  "Afrobeat / Amapiano": "afrobeat.json",
  "K-Pop": "kpop.json",
  "Folk / Acoustic": "folk.json",
  Disco: "disco.json",
  "New Age / Ambient": "ambient.json",
};

/** @returns {Map<string, string>} */
function loadExistingIds(genre) {
  const file = SEED_FILES[genre];
  if (!file) return new Map();
  const p = path.join(seedsDir, file);
  if (!fs.existsSync(p)) return new Map();
  const rows = readJson(p);
  const map = new Map();
  for (const [title, artist, , youtubeId] of rows) {
    if (!isRealId(youtubeId)) continue;
    map.set(`${title.toLowerCase()}|${artist.toLowerCase()}`, youtubeId);
  }
  return map;
}

/** @param {Song[]} songs @param {Map<string,string>} existing */
async function resolveWithExisting(songs, existing) {
  const filtered = songs.filter(([, , year]) => year >= 1980 && year <= 1989);
  /** @type {Row[]} */
  const out = [];
  /** @type {Song[]} */
  const needSearch = [];
  for (const row of filtered) {
    const [title, artist, year] = row;
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    const id = existing.get(key);
    if (id) out.push([title, artist, year, id]);
    else needSearch.push(row);
  }
  out.push(...(await resolve(needSearch)));
  return out;
}

const SEED_OUT = {
  "Hip-Hop / Rap": "hiphop.json",
  "R&B": "rnb.json",
  "Electronic / Dance": "electronic.json",
  Jazz: "jazz.json",
  Country: "country.json",
  Classical: "classical.json",
  Reggae: "reggae.json",
  "Latin Music": "latin.json",
  Metal: "metal.json",
  "Soul / Funk": "soul-funk.json",
  "Indie / Alternative": "indie.json",
  Blues: "blues.json",
  "Gospel / Christian": "gospel.json",
  "Afrobeat / Amapiano": "afrobeat.json",
  "K-Pop": "kpop.json",
  "Folk / Acoustic": "folk.json",
  Disco: "disco.json",
  "New Age / Ambient": "ambient.json",
};

/** Cap seed lists to A-list depth (majors ~110, minors ~35). */
function alistCap(genre) {
  return MAJOR.has(genre) ? 110 : 35;
}

function writeLiveCatalog(catalog) {
  // Pop / Rock live in dedicated files; everything else under _seeds/
  fs.writeFileSync(
    path.join(dataDir, "_pop.json"),
    JSON.stringify(catalog.Pop) + "\n",
  );
  fs.writeFileSync(
    path.join(dataDir, "_rock.json"),
    JSON.stringify(catalog.Rock) + "\n",
  );
  for (const [genre, file] of Object.entries(SEED_OUT)) {
    const rows = catalog[genre] ?? [];
    fs.writeFileSync(path.join(seedsDir, file), JSON.stringify(rows) + "\n");
  }
  // Rebuild public catalog.json in the same shape build-catalog.mjs expects
  /** @type {Record<string, Row[]>} */
  const publicCatalog = {};
  for (const g of GENRES) publicCatalog[g] = catalog[g] ?? [];
  fs.writeFileSync(
    path.join(dataDir, "catalog.json"),
    JSON.stringify(publicCatalog, null, 2) + "\n",
  );
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  /** @type {Record<string, Row[]>} */
  const catalog = {};
  const outPath = path.join(outDir, "alist-80s.json");

  // Only resume Pop/Rock from prior curated file — always rebuild other genres
  // from the latest A-list seed list so stale B-list data cannot linger.
  if (fs.existsSync(outPath)) {
    const prev = readJson(outPath);
    if (Array.isArray(prev.Pop)) catalog.Pop = prev.Pop;
    if (Array.isArray(prev.Rock)) catalog.Rock = prev.Rock;
  }

  // Pop from _pop.json — keep real megahits, drop soft album cuts
  const popRaw = readJson(path.join(dataDir, "_pop.json"));
  catalog.Pop = unique(
    popRaw.filter((r) => !POP_TRIM.has(`${r[0].toLowerCase()}|${r[1].toLowerCase()}`))
  ).slice(0, alistCap("Pop"));
  console.log(`Pop: ${catalog.Pop.length}`);

  // Rock from _rock.json (valid IDs) + seed additions
  const rockRaw = readJson(path.join(dataDir, "_rock.json"));
  const rockValid = rockRaw.filter((r) => isRealId(r[3]));
  const rockExtra = await resolve((seeds.Rock ?? []).slice(0, 40));
  catalog.Rock = unique([...rockValid, ...rockExtra]).slice(0, alistCap("Rock") + 40);
  console.log(`Rock: ${catalog.Rock.length}`);
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");

  for (const genre of GENRES) {
    if (genre === "Pop" || genre === "Rock") continue;
    const min = MAJOR.has(genre) ? 100 : 25;
    // Always rebuild from current A-list seeds (ignore stale curated rows)
    const base = (seeds[genre] ?? []).slice(0, alistCap(genre) + 15);
    const existing = loadExistingIds(genre);
    // Also reuse any matching IDs already in the YouTube search cache via resolve()
    console.log(`Resolving ${genre} (${base.length} seeds, ${existing.size} existing IDs)...`);
    try {
      const resolved = await resolveWithExisting(base, existing);
      catalog[genre] = unique(resolved);
      fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      console.log(`  -> ${catalog[genre].length}`);
      if (catalog[genre].length < min) {
        console.warn(`  WARN: ${genre} below minimum ${min}`);
      }
    } catch (err) {
      console.error(`Error on ${genre}:`, err);
    }
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");

  let ok = true;
  for (const g of GENRES) {
    const n = catalog[g]?.length ?? 0;
    const min = MAJOR.has(g) ? 100 : 25;
    const st = n >= min ? "OK" : "FAIL";
    if (n < min) ok = false;
    console.log(`${st.padEnd(4)} ${String(n).padStart(4)}  ${g}`);
  }

  if (ok) {
    writeLiveCatalog(catalog);
    console.log("\nWrote live seeds + data/catalog.json");
  }

  console.log(`\nWrote ${outPath}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
