import { NextResponse } from "next/server";
import { getAuthUser, getCurrentProfile, updateProfileById } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    full_name?: string;
  };

  const rawName = (body.fullName ?? body.full_name ?? "").trim();
  if (!rawName) {
    return NextResponse.json(
      { error: "Full name is required." },
      { status: 400 },
    );
  }
  if (rawName.length > 120) {
    return NextResponse.json(
      { error: "Full name must be 120 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    const profile = await updateProfileById(user.id, { full_name: rawName });
    if (!profile) {
      return NextResponse.json(
        { error: "Unable to update profile." },
        { status: 500 },
      );
    }
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
