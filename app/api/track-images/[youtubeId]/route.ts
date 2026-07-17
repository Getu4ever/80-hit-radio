import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { isValidYoutubeId } from "@/lib/trackImages";
import { getTrackImageFromSqlite } from "@/lib/trackImageDb";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "rithmgen-assets";

type RouteContext = { params: Promise<{ youtubeId: string }> };

function loadFromSqlite(youtubeId: string) {
  const row = getTrackImageFromSqlite(youtubeId);
  if (!row) return null;
  return { buffer: row.data, contentType: row.content_type };
}

async function loadFromSupabaseDb(
  youtubeId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("track_images")
      .select("data, content_type")
      .eq("youtube_id", youtubeId)
      .maybeSingle();

    if (error || !data?.data) return null;

    return {
      buffer: Buffer.from(data.data, "base64"),
      contentType: data.content_type || "image/jpeg",
    };
  } catch {
    return null;
  }
}

async function loadFromStorage(
  youtubeId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const admin = createAdminClient();
    for (const ext of ["jpg", "svg"] as const) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .download(`tracks/${youtubeId}.${ext}`);
      if (error || !data) continue;
      const buffer = Buffer.from(await data.arrayBuffer());
      if (buffer.length < 50) continue;
      return {
        buffer,
        contentType: ext === "svg" ? "image/svg+xml" : "image/jpeg",
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function loadFromDisk(
  youtubeId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const base = path.join(process.cwd(), "data", "track-image-store");
  for (const [ext, contentType] of [
    ["jpg", "image/jpeg"],
    ["svg", "image/svg+xml"],
  ] as const) {
    try {
      const buffer = await readFile(path.join(base, `${youtubeId}.${ext}`));
      if (!buffer.length) continue;
      return { buffer, contentType };
    } catch {
      // try next
    }
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { youtubeId: rawId } = await context.params;
  const youtubeId = decodeURIComponent(rawId ?? "").trim();

  if (!isValidYoutubeId(youtubeId)) {
    return NextResponse.json({ error: "Invalid youtube id" }, { status: 400 });
  }

  const image =
    loadFromSqlite(youtubeId) ??
    (await loadFromSupabaseDb(youtubeId)) ??
    (await loadFromStorage(youtubeId)) ??
    (await loadFromDisk(youtubeId));

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.buffer), {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Length": String(image.buffer.length),
    },
  });
}
