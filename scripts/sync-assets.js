#!/usr/bin/env node
/**
 * sync-assets.js — Populate Supabase Storage (`rithmgen-assets`) with artist & genre images.
 *
 * Reads the same catalog source used by `data/tracks.ts` (`data/catalog.json`),
 * fetches open-license images from Unsplash, uploads them with the service role,
 * and prints a manifest you can paste into TypeScript mappings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP (one time)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Ensure `.env.local` contains:
 *      NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Dashboard → Settings → API → service_role)
 *
 *    Optional aliases also supported:
 *      SUPABASE_URL=...
 *
 * 2. Create a free Unsplash developer app and add to `.env.local`:
 *      UNSPLASH_ACCESS_KEY=your_access_key
 *    https://unsplash.com/developers
 *
 * 3. Confirm the public bucket exists in Supabase Storage:
 *      Bucket name: rithmgen-assets
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *   # Full sync (all unique artists + all genres)
 *   node scripts/sync-assets.js
 *
 *   # Preview without uploading
 *   node scripts/sync-assets.js --dry-run
 *
 *   # Limit for testing (first 10 assets)
 *   node scripts/sync-assets.js --limit 10
 *
 *   # Only artists or only genres
 *   node scripts/sync-assets.js --artists-only
 *   node scripts/sync-assets.js --genres-only
 *
 *   # Slower / gentler on Unsplash rate limits (default 400ms between fetches)
 *   node scripts/sync-assets.js --delay 800
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OUTPUT
 * ─────────────────────────────────────────────────────────────────────────────
 * On success, prints JSON manifest entries like:
 *   { "type": "artist", "name": "Michael Jackson", "storagePath": "artists/michael-jackson.jpg" }
 *   { "type": "genre",  "name": "Pop",             "storagePath": "genres/pop.jpg" }
 *
 * Public URL pattern (after upload):
 *   ${SUPABASE_URL}/storage/v1/object/public/rithmgen-assets/artists/michael-jackson.jpg
 */

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "catalog.json");
const BUCKET = "rithmgen-assets";

/** Same genre keys as `data/tracks.ts` / `scripts/build-catalog.mjs`. */
const SUBGENRES = [
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

/** Retro / music-themed search hints per genre for better Unsplash results. */
const GENRE_SEARCH_HINTS = {
  Pop: "80s pop neon retro",
  Rock: "80s rock concert guitar",
  "Hip-Hop / Rap": "80s hip hop boombox street",
  "R&B": "80s rnb soul microphone",
  "Electronic / Dance": "80s synthesizer electronic dance",
  Jazz: "jazz saxophone vintage stage",
  Country: "country guitar cowboy hat vintage",
  Classical: "classical orchestra violin vintage",
  Reggae: "reggae vinyl tropical sunset",
  "Latin Music": "latin music percussion tropical",
  Metal: "heavy metal guitar stage lights",
  "Soul / Funk": "funk bass vinyl disco ball",
  "Indie / Alternative": "indie guitar cassette tape",
  Blues: "blues guitar smoky club",
  "Gospel / Christian": "gospel choir church organ",
  "Afrobeat / Amapiano": "afrobeat drums african rhythm",
  "K-Pop": "kpop stage lights microphone",
  "Folk / Acoustic": "acoustic guitar folk campfire",
  Disco: "disco ball 70s 80s dance floor",
  "New Age / Ambient": "ambient synth meditation cosmic",
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    artistsOnly: false,
    genresOnly: false,
    limit: Infinity,
    delayMs: 400,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--artists-only") opts.artistsOnly = true;
    else if (arg === "--genres-only") opts.genresOnly = true;
    else if (arg === "--limit") opts.limit = Number(argv[++i] ?? "0") || 0;
    else if (arg === "--delay") opts.delayMs = Number(argv[++i] ?? "400") || 400;
    else if (arg === "--help" || arg === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(0, 55).join("\n"));
      process.exit(0);
    }
  }

  if (opts.artistsOnly && opts.genresOnly) {
    throw new Error("Use only one of --artists-only or --genres-only.");
  }

  return opts;
}

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requireEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing env var. Set one of: ${names.join(", ")}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Catalog audit ───────────────────────────────────────────────────────────

/** @returns {{ artists: string[], genres: string[], trackCount: number }} */
function auditCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found: ${CATALOG_PATH}`);
  }

  /** @type {Record<string, Array<[string, string, number, string]>>} */
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const artistSet = new Set();
  let trackCount = 0;

  for (const genre of SUBGENRES) {
    const rows = catalog[genre] ?? [];
    for (const [, artist] of rows) {
      trackCount += 1;
      const name = String(artist ?? "").trim();
      if (name) artistSet.add(name);
    }
  }

  return {
    artists: [...artistSet].sort((a, b) => a.localeCompare(b)),
    genres: [...SUBGENRES],
    trackCount,
  };
}

// ─── Slugs & paths ───────────────────────────────────────────────────────────

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function artistStoragePath(artistName) {
  return `artists/${slugify(artistName)}.jpg`;
}

function genreStoragePath(genreName) {
  return `genres/${slugify(genreName)}.jpg`;
}

// ─── Unsplash fetch ──────────────────────────────────────────────────────────

async function searchUnsplashPhoto(query, accessKey) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("per_page", "1");
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Unsplash search failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const photo = json.results?.[0];
  if (!photo?.urls?.regular) {
    throw new Error(`No Unsplash results for query: ${query}`);
  }

  return {
    pageUrl: photo.links?.html ?? "https://unsplash.com",
    downloadUrl: photo.urls.regular,
    photographer: photo.user?.name ?? "Unknown",
  };
}

async function downloadImageBuffer(imageUrl) {
  const res = await fetch(imageUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Image download failed (${res.status}): ${imageUrl}`);
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: contentType.split(";")[0].trim(),
  };
}

function buildArtistQuery(artistName) {
  return `${artistName} musician portrait retro 80s`;
}

function buildGenreQuery(genreName) {
  return GENRE_SEARCH_HINTS[genreName] ?? `${genreName} music retro vinyl`;
}

// ─── Supabase upload ─────────────────────────────────────────────────────────

function createSupabaseAdmin() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function uploadToBucket(supabase, storagePath, buffer, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });

  if (error) {
    throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
  }
}

// ─── Sync orchestration ──────────────────────────────────────────────────────

/**
 * @param {{
 *   type: "artist" | "genre",
 *   name: string,
 *   storagePath: string,
 *   query: string,
 * }} item
 */
async function syncAsset(item, ctx) {
  const { supabase, unsplashKey, dryRun, delayMs } = ctx;

  console.log(`\n→ [${item.type}] ${item.name}`);
  console.log(`  query: ${item.query}`);
  console.log(`  path:  ${item.storagePath}`);

  if (dryRun) {
    return {
      ...item,
      status: "dry-run",
      publicUrl: null,
      source: null,
    };
  }

  await sleep(delayMs);
  const photo = await searchUnsplashPhoto(item.query, unsplashKey);
  const { buffer, contentType } = await downloadImageBuffer(photo.downloadUrl);
  await uploadToBucket(supabase, item.storagePath, buffer, contentType);

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${item.storagePath}`;

  console.log(`  ✓ uploaded (${contentType}, ${buffer.length} bytes)`);
  console.log(`  ✓ unsplash: ${photo.pageUrl} (by ${photo.photographer})`);

  return {
    ...item,
    status: "uploaded",
    publicUrl,
    source: photo.pageUrl,
    photographer: photo.photographer,
  };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const opts = parseArgs(process.argv.slice(2));
  const { artists, genres, trackCount } = auditCatalog();

  console.log("Rithmgen asset sync");
  console.log("──────────────────");
  console.log(`Catalog tracks : ${trackCount}`);
  console.log(`Unique artists : ${artists.length}`);
  console.log(`Genres         : ${genres.length}`);
  console.log(`Bucket         : ${BUCKET}`);
  console.log(`Dry run        : ${opts.dryRun ? "yes" : "no"}`);

  /** @type {Array<{ type: "artist" | "genre", name: string, storagePath: string, query: string }>} */
  const queue = [];

  if (!opts.genresOnly) {
    for (const artist of artists) {
      queue.push({
        type: "artist",
        name: artist,
        storagePath: artistStoragePath(artist),
        query: buildArtistQuery(artist),
      });
    }
  }

  if (!opts.artistsOnly) {
    for (const genre of genres) {
      queue.push({
        type: "genre",
        name: genre,
        storagePath: genreStoragePath(genre),
        query: buildGenreQuery(genre),
      });
    }
  }

  const limitedQueue =
    Number.isFinite(opts.limit) && opts.limit > 0
      ? queue.slice(0, opts.limit)
      : queue;

  console.log(`Queued assets  : ${limitedQueue.length}`);

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!opts.dryRun && !unsplashKey) {
    throw new Error(
      "Missing UNSPLASH_ACCESS_KEY. Create a free app at https://unsplash.com/developers and add the key to .env.local",
    );
  }

  const supabase = opts.dryRun ? null : createSupabaseAdmin();
  const ctx = {
    supabase,
    unsplashKey: unsplashKey || "dry-run",
    dryRun: opts.dryRun,
    delayMs: opts.delayMs,
  };

  const manifest = [];
  const failures = [];

  for (const item of limitedQueue) {
    try {
      const result = await syncAsset(item, ctx);
      manifest.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ failed: ${message}`);
      failures.push({ ...item, error: message });
    }
  }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("MANIFEST — storage paths for TypeScript mapping");
  console.log("════════════════════════════════════════════════════════\n");

  const printable = manifest.map(({ type, name, storagePath, publicUrl, status }) => ({
    type,
    name,
    storagePath,
    ...(publicUrl ? { publicUrl } : {}),
    status,
  }));

  console.log(JSON.stringify(printable, null, 2));

  if (failures.length > 0) {
    console.log("\nFailures:");
    console.log(JSON.stringify(failures, null, 2));
  }

  console.log("\nSummary");
  console.log(`  uploaded/dry-run: ${manifest.length}`);
  console.log(`  failed          : ${failures.length}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
