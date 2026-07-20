import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const NEWS_CACHE_TTL_MS = 60 * 60 * 1000;

const CACHE_DIR = path.join("/tmp", "rithmgen-news");
const MP3_PATH = path.join(CACHE_DIR, "latest_news.mp3");
const META_PATH = path.join(CACHE_DIR, "latest_news.meta.json");

type CacheMeta = {
  generatedAt: number;
};

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

export async function readNewsCache(): Promise<{
  buffer: Buffer;
  ageMs: number;
} | null> {
  try {
    const [audio, metaRaw] = await Promise.all([
      readFile(MP3_PATH),
      readFile(META_PATH, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as CacheMeta;
    if (!meta.generatedAt || audio.length === 0) return null;
    const ageMs = Date.now() - meta.generatedAt;
    if (ageMs >= NEWS_CACHE_TTL_MS) return null;
    return { buffer: audio, ageMs };
  } catch {
    return null;
  }
}

export async function writeNewsCache(buffer: Buffer): Promise<void> {
  await ensureCacheDir();
  const meta: CacheMeta = { generatedAt: Date.now() };
  await Promise.all([
    writeFile(MP3_PATH, buffer),
    writeFile(META_PATH, JSON.stringify(meta), "utf8"),
  ]);
}

export async function isNewsCacheFresh(): Promise<boolean> {
  try {
    const metaRaw = await readFile(META_PATH, "utf8");
    const meta = JSON.parse(metaRaw) as CacheMeta;
    return Date.now() - meta.generatedAt < NEWS_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/** Best-effort age for response headers. */
export async function newsCacheAgeMs(): Promise<number | null> {
  try {
    const metaRaw = await readFile(META_PATH, "utf8");
    const meta = JSON.parse(metaRaw) as CacheMeta;
    return Date.now() - meta.generatedAt;
  } catch {
    try {
      const s = await stat(MP3_PATH);
      return Date.now() - s.mtimeMs;
    } catch {
      return null;
    }
  }
}
