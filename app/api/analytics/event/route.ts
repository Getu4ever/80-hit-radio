import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { recordListenEvent } from "@/lib/catalog/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    eventType?: "play_start" | "play_complete" | "skip" | "session_start";
    trackId?: string | null;
    durationSeconds?: number | null;
  };

  if (!body.eventType) {
    return NextResponse.json({ error: "eventType is required" }, { status: 400 });
  }

  const profile = await getCurrentProfile();
  const trackId =
    body.trackId && UUID_RE.test(body.trackId) ? body.trackId : null;

  try {
    await recordListenEvent({
      eventType: body.eventType,
      trackId,
      userId: profile?.id ?? null,
      durationSeconds: body.durationSeconds ?? undefined,
      metadata: body.trackId && !trackId ? { clientTrackId: body.trackId } : {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/analytics/event:", err);
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }
}
