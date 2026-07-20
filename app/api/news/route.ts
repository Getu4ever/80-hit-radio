import { NextResponse } from "next/server";
import { isNewsBulletinEnabled } from "@/lib/broadcastSchedule";
import {
  isNewsCacheFresh,
  newsCacheAgeMs,
  readNewsCache,
  writeNewsCache,
} from "@/lib/news/cache";
import { synthesizeLuxuryBulletin } from "@/lib/news/elevenlabs";
import { fetchTopHeadlines } from "@/lib/news/headlines";
import { buildNewsScript } from "@/lib/news/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dedupe concurrent regenerations within the same serverless instance. */
let generationPromise: Promise<Buffer> | null = null;

async function generateFreshBulletin(): Promise<Buffer> {
  const headlines = await fetchTopHeadlines(3);
  const script = buildNewsScript(headlines);
  const audio = await synthesizeLuxuryBulletin(script);
  await writeNewsCache(audio);
  return audio;
}

async function getOrGenerateBulletin(): Promise<Buffer> {
  const cached = await readNewsCache();
  if (cached) return cached.buffer;

  if (await isNewsCacheFresh()) {
    const again = await readNewsCache();
    if (again) return again.buffer;
  }

  if (!generationPromise) {
    generationPromise = generateFreshBulletin().finally(() => {
      generationPromise = null;
    });
  }

  return generationPromise;
}

function audioResponse(buffer: Buffer, cacheHit: boolean, ageMs: number | null) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=300",
      "X-News-Cache": cacheHit ? "HIT" : "MISS",
      ...(ageMs != null ? { "X-News-Cache-Age": String(Math.floor(ageMs / 1000)) } : {}),
    },
  });
}

export async function GET() {
  if (!isNewsBulletinEnabled()) {
    return NextResponse.json(
      { error: "News bulletin unavailable" },
      { status: 503 },
    );
  }

  try {
    const cached = await readNewsCache();
    if (cached) {
      return audioResponse(cached.buffer, true, cached.ageMs);
    }

    const buffer = await getOrGenerateBulletin();
    const ageMs = await newsCacheAgeMs();
    return audioResponse(buffer, false, ageMs);
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;

    console.error("GET /api/news:", err);

    // Stale cache beats silence when regeneration fails (credits, RSS, etc.).
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const stale = await readFile(join("/tmp/rithmgen-news", "latest_news.mp3"));
      if (stale.length > 0) {
        return audioResponse(Buffer.from(stale), true, null);
      }
    } catch {
      // No stale fallback.
    }

    return NextResponse.json(
      { error: "News bulletin generation failed" },
      { status: status === 402 || status === 429 ? 503 : 503 },
    );
  }
}
