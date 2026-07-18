import { NextResponse } from "next/server";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { upsertListenerPresence } from "@/lib/catalog/server";
import {
  addGuestListenSecondsServer,
  getGuestListenQuota,
} from "@/lib/guestListenServer";

/**
 * Presence ping. For guests, optional deltaSeconds accrues the 1-hour server quota.
 * Signed-in users skip guest accrual (account entitlement).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    deltaSeconds?: number;
    playing?: boolean;
  };

  if (!body.sessionId?.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const profile = await getCurrentProfile();
  const user = profile ? null : await getAuthUser();
  const isGuest = !profile && !user;

  try {
    await upsertListenerPresence({
      sessionId: body.sessionId.trim(),
      userId: profile?.id ?? null,
    });

    if (!isGuest) {
      return NextResponse.json({ ok: true, guest: false });
    }

    const delta = Number(body.deltaSeconds) || 0;
    const quota =
      delta > 0 && body.playing !== false
        ? await addGuestListenSecondsServer(request, delta)
        : await getGuestListenQuota(request);

    return NextResponse.json({
      ok: true,
      guest: true,
      exhausted: quota.exhausted,
      secondsListened: quota.secondsListened,
      secondsRemaining: quota.secondsRemaining,
      message: quota.exhausted ? quota.message : undefined,
    });
  } catch (err) {
    console.error("POST /api/analytics/heartbeat:", err);
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }
}
