import { NextResponse } from "next/server";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import {
  LOUNGE_MAX_MESSAGE_LENGTH,
  LOUNGE_MESSAGE_LIMIT,
  LOUNGE_POST_COOLDOWN_MS,
  LOUNGE_REACTIONS,
  loungeDisplayName,
  sanitizeLoungeBody,
  type LoungeReactionEmoji,
} from "@/lib/lounge/shared";
import { isStreamingEligible } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReactionCounts = Record<LoungeReactionEmoji, number>;

function emptyReactions(): ReactionCounts {
  return {
    "🔥": 0,
    "🕺": 0,
    "💜": 0,
    "✨": 0,
    "🙌": 0,
  };
}

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  return /track_lounge_|schema cache|does not exist|Could not find the table/i.test(
    message,
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId")?.trim();

  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      trackId,
      messages: [],
      reactions: emptyReactions(),
      myReactions: [],
      canPost: false,
      unavailable: true,
    });
  }

  try {
    const admin = createAdminClient();
    const profile = await getCurrentProfile();
    const canPost = Boolean(
      profile && isStreamingEligible(profile).eligible,
    );

    const [{ data: messages, error: msgError }, { data: reactions, error: rxError }] =
      await Promise.all([
        admin
          .from("track_lounge_messages")
          .select("id, catalog_track_id, user_id, display_name, body, created_at")
          .eq("catalog_track_id", trackId)
          .order("created_at", { ascending: false })
          .limit(LOUNGE_MESSAGE_LIMIT),
        admin
          .from("track_lounge_reactions")
          .select("emoji, user_id")
          .eq("catalog_track_id", trackId),
      ]);

    if (msgError || rxError) {
      const detail = msgError?.message ?? rxError?.message;
      if (isMissingTableError(detail)) {
        return NextResponse.json({
          trackId,
          messages: [],
          reactions: emptyReactions(),
          myReactions: [],
          canPost,
          unavailable: true,
        });
      }
      console.error("GET /api/lounge:", detail);
      return NextResponse.json(
        { error: "Unable to load lounge" },
        { status: 503 },
      );
    }

    const counts = emptyReactions();
    const myReactions: LoungeReactionEmoji[] = [];
    for (const row of reactions ?? []) {
      const emoji = row.emoji as LoungeReactionEmoji;
      if (emoji in counts) counts[emoji] += 1;
      if (profile && row.user_id === profile.id && emoji in counts) {
        myReactions.push(emoji);
      }
    }

    return NextResponse.json({
      trackId,
      messages: (messages ?? []).reverse(),
      reactions: counts,
      myReactions,
      canPost,
      unavailable: false,
    });
  } catch (err) {
    console.error("GET /api/lounge failed:", err);
    return NextResponse.json(
      { error: "Unable to load lounge" },
      { status: 503 },
    );
  }
}

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
      { error: "Sign in to join the track lounge." },
      { status: 401 },
    );
  }

  const profile = await getCurrentProfile();
  if (!profile || !isStreamingEligible(profile).eligible) {
    return NextResponse.json(
      { error: "A free trial or Premium membership is needed to post." },
      { status: 403 },
    );
  }

  let body: { trackId?: string; message?: string };
  try {
    body = (await request.json()) as { trackId?: string; message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.trackId?.trim();
  const message = sanitizeLoungeBody(body.message ?? "");

  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Say something short." }, { status: 400 });
  }
  if (message.length > LOUNGE_MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const { data: recent } = await admin
      .from("track_lounge_messages")
      .select("created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.created_at) {
      const elapsed = Date.now() - new Date(recent.created_at).getTime();
      if (elapsed < LOUNGE_POST_COOLDOWN_MS) {
        return NextResponse.json(
          { error: "Easy — wait a moment before the next line." },
          { status: 429 },
        );
      }
    }

    const displayName = loungeDisplayName({
      fullName: profile.full_name,
      email: profile.email,
    });

    const { data, error } = await admin
      .from("track_lounge_messages")
      .insert({
        catalog_track_id: trackId,
        user_id: profile.id,
        display_name: displayName,
        body: message,
      })
      .select("id, catalog_track_id, user_id, display_name, body, created_at")
      .single();

    if (error) {
      if (isMissingTableError(error.message)) {
        return NextResponse.json(
          {
            error:
              "Lounge tables are not set up yet. Apply migration 008_track_lounge.sql.",
          },
          { status: 503 },
        );
      }
      console.error("POST /api/lounge:", error.message);
      return NextResponse.json(
        { error: "Could not post to the lounge." },
        { status: 503 },
      );
    }

    return NextResponse.json({ message: data });
  } catch (err) {
    console.error("POST /api/lounge failed:", err);
    return NextResponse.json(
      { error: "Could not post to the lounge." },
      { status: 503 },
    );
  }
}

/** Exported for react route typing / docs. */
export const LOUNGE_EMOJI_SET = LOUNGE_REACTIONS;
