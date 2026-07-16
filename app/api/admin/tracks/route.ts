import { NextResponse } from "next/server";
import {
  createTrack,
  deleteTrack,
  getCatalog,
  isValidSubgenre,
  isValidYoutubeId,
  listAdminTracks,
  seedCatalogFromStatic,
} from "@/lib/catalog/server";
import { requireAdmin } from "@/lib/auth/session";

export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  try {
    const [tracks, catalog] = await Promise.all([
      listAdminTracks(),
      getCatalog(),
    ]);
    return NextResponse.json({
      tracks,
      source: catalog.source,
      total: catalog.total,
    });
  } catch (err) {
    console.error("GET /api/admin/tracks:", err);
    return NextResponse.json({ error: "Failed to load tracks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const body = (await request.json()) as {
    action?: string;
    title?: string;
    artist?: string;
    year?: number;
    youtubeId?: string;
    subgenre?: string;
  };

  if (body.action === "seed") {
    try {
      const result = await seedCatalogFromStatic();
      return NextResponse.json(result);
    } catch (err) {
      console.error("POST /api/admin/tracks seed:", err);
      return NextResponse.json({ error: "Seed failed" }, { status: 500 });
    }
  }

  const { title, artist, year, youtubeId, subgenre } = body;
  if (!title?.trim() || !artist?.trim() || !youtubeId?.trim() || !subgenre) {
    return NextResponse.json(
      { error: "title, artist, youtubeId, and subgenre are required" },
      { status: 400 },
    );
  }
  if (!isValidYoutubeId(youtubeId.trim())) {
    return NextResponse.json(
      { error: "youtubeId must be an 11-character YouTube video ID" },
      { status: 400 },
    );
  }
  if (!isValidSubgenre(subgenre)) {
    return NextResponse.json({ error: "Invalid subgenre" }, { status: 400 });
  }
  if (typeof year !== "number" || year < 1980 || year > 1989) {
    return NextResponse.json(
      { error: "year must be between 1980 and 1989" },
      { status: 400 },
    );
  }

  try {
    const track = await createTrack({
      title,
      artist,
      year,
      youtubeId,
      subgenre,
    });
    return NextResponse.json({ track });
  } catch (err) {
    console.error("POST /api/admin/tracks:", err);
    return NextResponse.json({ error: "Failed to add track" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("id");
  if (!trackId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteTrack(trackId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/tracks:", err);
    return NextResponse.json({ error: "Failed to delete track" }, { status: 500 });
  }
}
