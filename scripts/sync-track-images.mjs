#!/usr/bin/env node
/**
 * sync-track-images.mjs
 *
 * Downloads artwork for every catalog track and stores it:
 *   1. data/track-image-store/{youtubeId}.jpg|.svg  (disk fallback)
 *   2. Supabase public.track_images                 (preferred DB)
 *   3. Supabase Storage rithmgen-assets/tracks/…    (remote backup)
 *
 * When a YouTube thumb 404s, searches YouTube for the official video,
 * repairs the catalog youtube_id, and stores that artwork.
 *
 * Run:
 *   node scripts/sync-track-images.mjs
 *   node scripts/sync-track-images.mjs --limit 20
 *   node scripts/sync-track-images.mjs --force
 *
 * Apply migration (Supabase SQL editor) if prompted:
 *   supabase/migrations/005_track_images.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "catalog.json");
const STORE_DIR = path.join(ROOT, "data", "track-image-store");
const SQLITE_PATH = path.join(ROOT, "data", "track-images.sqlite");
const BUCKET = "rithmgen-assets";
const YT_CACHE_PATH = path.join(ROOT, "data", "_curated", ".yt-cache.json");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const NO_REPAIR = args.includes("--no-repair");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ""
).trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.includes("placeholder")) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** @type {Record<string, string>} */
let ytCache = fs.existsSync(YT_CACHE_PATH)
  ? JSON.parse(fs.readFileSync(YT_CACHE_PATH, "utf8"))
  : {};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function collectTracks() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  /** @type {Array<{ title: string, artist: string, year: number, youtubeId: string, genre: string, index: number }>} */
  const tracks = [];
  for (const [genre, rows] of Object.entries(catalog)) {
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, index) => {
      const [title, artist, year, youtubeId] = row;
      if (
        typeof title === "string" &&
        typeof artist === "string" &&
        typeof youtubeId === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(youtubeId)
      ) {
        tracks.push({ title, artist, year, youtubeId, genre, index });
      }
    });
  }
  return { catalog, tracks };
}

async function downloadThumb(youtubeId) {
  const hosts = ["i", "i1", "i2", "i3", "i4"];
  const qualities = ["hqdefault", "mqdefault", "sddefault", "0"];
  const urls = [];
  for (const host of hosts) {
    for (const q of qualities) {
      urls.push(`https://${host}.ytimg.com/vi/${youtubeId}/${q}.jpg`);
    }
  }
  urls.push(`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`);

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "image/*,*/*",
        },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue; // placeholder 404 image
      return buf;
    } catch {
      // next
    }
  }
  return null;
}

async function ytSearch(q) {
  if (ytCache[q]) return ytCache[q];
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
    const ids = [...t.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(
      (m) => m[1],
    );
    const id = ids[0] ?? null;
    if (id) {
      ytCache[q] = id;
      return id;
    }
  } catch {
    // ignore
  }
  return null;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function placeholderSvg(title, artist) {
  const t = escapeXml(title.slice(0, 42));
  const a = escapeXml(artist.slice(0, 42));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b0764"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#083344"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <circle cx="320" cy="250" r="90" fill="none" stroke="#22d3ee" stroke-width="3" opacity="0.5"/>
  <circle cx="320" cy="250" r="40" fill="#d946ef" opacity="0.8"/>
  <text x="320" y="400" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-size="28" font-weight="700">${t}</text>
  <text x="320" y="445" text-anchor="middle" fill="#67e8f9" font-family="system-ui,sans-serif" font-size="20">${a}</text>
  <text x="320" y="580" text-anchor="middle" fill="#ffffff55" font-family="system-ui,sans-serif" font-size="14" letter-spacing="4">RITHMGEN</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

function openSqlite() {
  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
  const db = new DatabaseSync(SQLITE_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS track_images (
      youtube_id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      data BLOB NOT NULL,
      byte_size INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function upsertSqlite(youtubeId, buffer, contentType) {
  const db = openSqlite();
  db.prepare(
    `INSERT INTO track_images (youtube_id, content_type, data, byte_size, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(youtube_id) DO UPDATE SET
       content_type = excluded.content_type,
       data = excluded.data,
       byte_size = excluded.byte_size,
       updated_at = excluded.updated_at`,
  ).run(youtubeId, contentType, buffer, buffer.length, new Date().toISOString());
  db.close();
}

let tableReady = false;

async function probeTable() {
  const { error } = await supabase
    .from("track_images")
    .select("youtube_id")
    .limit(1);
  if (!error) {
    tableReady = true;
    return true;
  }
  if (
    error.code === "42P01" ||
    /does not exist|Could not find the table/i.test(error.message)
  ) {
    console.warn(
      "\n⚠  Table public.track_images is missing.\n" +
        "   Run supabase/migrations/005_track_images.sql in the Supabase SQL editor,\n" +
        "   then re-run this script. Images are still saved to disk + Storage.\n",
    );
    tableReady = false;
    return false;
  }
  console.warn("track_images probe:", error.message);
  tableReady = false;
  return false;
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5_000_000,
  });
  if (error && !/already exists/i.test(error.message)) {
    console.warn("Bucket create:", error.message);
  }
}

async function upsertDb(youtubeId, buffer, contentType) {
  if (!tableReady) return false;
  const { error } = await supabase.from("track_images").upsert(
    {
      youtube_id: youtubeId,
      content_type: contentType,
      data: buffer.toString("base64"),
      byte_size: buffer.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "youtube_id" },
  );
  if (error) {
    console.warn(`  DB upsert failed ${youtubeId}:`, error.message);
    return false;
  }
  return true;
}

async function upsertStorage(youtubeId, buffer, contentType, ext) {
  const objectPath = `tracks/${youtubeId}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      contentType,
      upsert: true,
    });
  if (error) {
    console.warn(`  Storage upload failed ${youtubeId}:`, error.message);
    return false;
  }
  return true;
}

function diskPaths(youtubeId) {
  return {
    jpg: path.join(STORE_DIR, `${youtubeId}.jpg`),
    svg: path.join(STORE_DIR, `${youtubeId}.svg`),
  };
}

function readCached(youtubeId) {
  const { jpg, svg } = diskPaths(youtubeId);
  if (fs.existsSync(jpg) && fs.statSync(jpg).size > 2000) {
    return {
      buffer: fs.readFileSync(jpg),
      contentType: "image/jpeg",
      ext: "jpg",
    };
  }
  if (fs.existsSync(svg) && fs.statSync(svg).size > 100) {
    return {
      buffer: fs.readFileSync(svg),
      contentType: "image/svg+xml",
      ext: "svg",
    };
  }
  return null;
}

async function resolveImage(track) {
  let youtubeId = track.youtubeId;
  let repaired = false;

  let buffer = await downloadThumb(youtubeId);
  if (!buffer && !NO_REPAIR) {
    const q = `${track.artist} ${track.title} official video`;
    const found = await ytSearch(q);
    if (found && found !== youtubeId) {
      const alt = await downloadThumb(found);
      if (alt) {
        buffer = alt;
        youtubeId = found;
        repaired = true;
      }
    }
  }

  if (buffer) {
    return {
      storeId: track.youtubeId, // keep API key = original catalog id until catalog rewrite
      playbackId: youtubeId,
      buffer,
      contentType: "image/jpeg",
      ext: "jpg",
      repaired,
    };
  }

  return {
    storeId: track.youtubeId,
    playbackId: track.youtubeId,
    buffer: placeholderSvg(track.title, track.artist),
    contentType: "image/svg+xml",
    ext: "svg",
    repaired: false,
    placeholder: true,
  };
}

async function main() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  await ensureBucket();
  await probeTable();

  const { catalog, tracks } = collectTracks();
  const selected = Number.isFinite(LIMIT) ? tracks.slice(0, LIMIT) : tracks;

  // Dedupe by youtubeId for download, but repair may rewrite catalog rows
  const seen = new Set();
  /** @type {typeof selected} */
  const unique = [];
  for (const t of selected) {
    if (seen.has(t.youtubeId)) continue;
    seen.add(t.youtubeId);
    unique.push(t);
  }

  console.log(
    `Syncing ${unique.length} unique track images (from ${selected.length} rows)…`,
  );
  console.log(`  sqlite → ${SQLITE_PATH}`);
  console.log(`  disk   → ${STORE_DIR}`);
  console.log(`  db     → track_images (${tableReady ? "ready" : "skipped"})`);
  console.log(`  stor   → ${BUCKET}/tracks/`);

  let ok = 0;
  let cached = 0;
  let repaired = 0;
  let placeholders = 0;
  let failed = 0;
  let dbOk = 0;
  let sqliteOk = 0;
  let catalogDirty = false;

  for (let i = 0; i < unique.length; i++) {
    const track = unique[i];
    process.stdout.write(
      `[${i + 1}/${unique.length}] ${track.youtubeId} ${track.title.slice(0, 28)} `,
    );

    let image = !FORCE ? readCached(track.youtubeId) : null;
    let playbackId = track.youtubeId;
    let wasRepaired = false;
    let isPlaceholder = false;

    if (image) {
      process.stdout.write("(cached) ");
      cached += 1;
    } else {
      const resolved = await resolveImage(track);
      image = {
        buffer: resolved.buffer,
        contentType: resolved.contentType,
        ext: resolved.ext,
      };
      playbackId = resolved.playbackId;
      wasRepaired = Boolean(resolved.repaired);
      isPlaceholder = Boolean(resolved.placeholder);

      const dest = diskPaths(track.youtubeId)[resolved.ext === "svg" ? "svg" : "jpg"];
      fs.writeFileSync(dest, resolved.buffer);

      if (wasRepaired) {
        // Update all catalog rows that used the dead id
        for (const rows of Object.values(catalog)) {
          if (!Array.isArray(rows)) continue;
          for (const row of rows) {
            if (row[3] === track.youtubeId) {
              row[3] = playbackId;
              catalogDirty = true;
            }
          }
        }
        // Re-key disk file to new id as well for future lookups
        const newDest = diskPaths(playbackId).jpg;
        fs.writeFileSync(newDest, resolved.buffer);
        repaired += 1;
        process.stdout.write(`(repaired→${playbackId}) `);
      } else if (isPlaceholder) {
        placeholders += 1;
        process.stdout.write("(placeholder) ");
      } else {
        process.stdout.write(`(${Math.round(resolved.buffer.length / 1024)}kb) `);
      }
    }

    // Store under both old and new ids when repaired so either path works mid-rollout
    const idsToStore = wasRepaired
      ? [...new Set([track.youtubeId, playbackId])]
      : [playbackId];

    for (const id of idsToStore) {
      try {
        upsertSqlite(id, image.buffer, image.contentType);
        sqliteOk += 1;
      } catch (err) {
        console.warn(`  sqlite failed ${id}:`, err.message);
      }
      if (await upsertDb(id, image.buffer, image.contentType)) dbOk += 1;
      await upsertStorage(id, image.buffer, image.contentType, image.ext);
    }

    console.log("OK");
    ok += 1;
    await sleep(150);

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(YT_CACHE_PATH, JSON.stringify(ytCache, null, 2));
      if (catalogDirty) {
        fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
      }
    }
  }

  fs.writeFileSync(YT_CACHE_PATH, JSON.stringify(ytCache, null, 2));
  if (catalogDirty) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
    // Keep seed files in sync for repaired ids — rebuild from catalog is enough for runtime
    console.log("Updated data/catalog.json with repaired YouTube IDs.");
  }

  console.log(
    `\nDone. ok=${ok} cached=${cached} repaired=${repaired} placeholders=${placeholders} failed=${failed} sqlite=${sqliteOk} supabase_db=${dbOk}`,
  );
  if (!tableReady) {
    console.log(
      "\nOptional: apply supabase/migrations/005_track_images.sql then re-run to mirror images into Supabase Postgres.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
