import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  listArtists,
  updateArtistImage,
  uploadArtistImage,
} from "@/lib/catalog/server";

export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  try {
    const artists = await listArtists();
    return NextResponse.json({ artists });
  } catch (err) {
    console.error("GET /api/admin/artists:", err);
    return NextResponse.json({ error: "Failed to load artists" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const body = (await request.json()) as {
    artistId?: string;
    imageUrl?: string;
  };

  if (!body.artistId || !body.imageUrl?.trim()) {
    return NextResponse.json(
      { error: "artistId and imageUrl are required" },
      { status: 400 },
    );
  }

  try {
    const artist = await updateArtistImage(body.artistId, body.imageUrl.trim());
    return NextResponse.json({ artist });
  } catch (err) {
    console.error("PATCH /api/admin/artists:", err);
    return NextResponse.json(
      { error: "Failed to update artist image" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const form = await request.formData();
  const artistId = form.get("artistId");
  const file = form.get("file");

  if (typeof artistId !== "string" || !(file instanceof File)) {
    return NextResponse.json(
      { error: "artistId and file are required" },
      { status: 400 },
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "File must be an image" },
      { status: 400 },
    );
  }

  try {
    const artist = await uploadArtistImage(artistId, file);
    return NextResponse.json({ artist });
  } catch (err) {
    console.error("POST /api/admin/artists:", err);
    return NextResponse.json(
      { error: "Failed to upload artist image" },
      { status: 500 },
    );
  }
}
