import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { upsertListenerPresence } from "@/lib/catalog/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };

  if (!body.sessionId?.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const profile = await getCurrentProfile();

  try {
    await upsertListenerPresence({
      sessionId: body.sessionId.trim(),
      userId: profile?.id ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/analytics/heartbeat:", err);
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }
}
