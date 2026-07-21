import { NextResponse } from "next/server";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import {
  isLoungeReactionEmoji,
  type LoungeReactionEmoji,
} from "@/lib/lounge/shared";
import { isStreamingEligible } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  return /track_lounge_|schema cache|does not exist|Could not find the table/i.test(
    message,
  );
}

/** Toggle a reaction on the current track lounge. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Lounge is not configured yet." },
      { status: 503 },
    );
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to react." },
      { status: 401 },
    );
  }

  const profile = await getCurrentProfile();
  if (!profile || !isStreamingEligible(profile).eligible) {
    return NextResponse.json(
      { error: "A free trial or Premium membership is needed to react." },
      { status: 403 },
    );
  }

  let body: { trackId?: string; emoji?: string };
  try {
    body = (await request.json()) as { trackId?: string; emoji?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.trackId?.trim();
  const emoji = body.emoji?.trim() ?? "";

  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }
  if (!isLoungeReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("track_lounge_reactions")
      .select("emoji")
      .eq("catalog_track_id", trackId)
      .eq("user_id", profile.id)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("track_lounge_reactions")
        .delete()
        .eq("catalog_track_id", trackId)
        .eq("user_id", profile.id)
        .eq("emoji", emoji);

      if (error) {
        if (isMissingTableError(error.message)) {
          return NextResponse.json(
            { error: "Lounge tables are not set up yet." },
            { status: 503 },
          );
        }
        throw error;
      }

      return NextResponse.json({
        trackId,
        emoji: emoji as LoungeReactionEmoji,
        active: false,
      });
    }

    const { error } = await admin.from("track_lounge_reactions").insert({
      catalog_track_id: trackId,
      user_id: profile.id,
      emoji,
    });

    if (error) {
      if (isMissingTableError(error.message)) {
        return NextResponse.json(
          { error: "Lounge tables are not set up yet." },
          { status: 503 },
        );
      }
      throw error;
    }

    return NextResponse.json({
      trackId,
      emoji: emoji as LoungeReactionEmoji,
      active: true,
    });
  } catch (err) {
    console.error("POST /api/lounge/react:", err);
    return NextResponse.json(
      { error: "Could not update reaction." },
      { status: 503 },
    );
  }
}
