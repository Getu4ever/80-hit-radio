import { NextResponse } from "next/server";
import { getAuthUser, updateProfileById } from "@/lib/auth/session";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Choose an image file to upload." },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Use a JPG, PNG, WebP, or GIF image." },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 2 MB." },
      { status: 400 },
    );
  }

  const ext = extensionForMime(file.type);
  const path = `${user.id}/avatar.${ext}`;
  const supabase = await createClient();
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });

  if (uploadError) {
    console.error("POST /api/profile/avatar upload:", uploadError.message);
    return NextResponse.json(
      {
        error:
          uploadError.message.includes("Bucket not found")
            ? "Avatar storage is not set up yet. Run migration 006_profile_identity.sql in Supabase."
            : uploadError.message,
      },
      { status: 500 },
    );
  }

  const { url } = getSupabaseEnv();
  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`;

  try {
    const profile = await updateProfileById(user.id, { avatar_url: publicUrl });
    return NextResponse.json({
      avatarUrl: publicUrl,
      profile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to save avatar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
