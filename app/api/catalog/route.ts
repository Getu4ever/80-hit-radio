import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog/server";
import { buildStaticTracks } from "@/lib/catalog/static";

export async function GET() {
  try {
    const catalog = await getCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("GET /api/catalog:", err);
    const tracks = buildStaticTracks();
    return NextResponse.json({
      tracks,
      source: "static",
      total: tracks.length,
    });
  }
}
