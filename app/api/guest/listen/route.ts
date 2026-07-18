import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import {
  addGuestListenSecondsServer,
  getGuestListenQuota,
} from "@/lib/guestListenServer";

/**
 * GET  — current guest quota for this IP / device (no accrual).
 * POST — accrue deltaSeconds while a guest is playing.
 *
 * Signed-in users bypass guest hour (account entitlement) — no-op with exhausted:false.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (user) {
    return NextResponse.json({
      guest: false,
      exhausted: false,
      secondsListened: 0,
      secondsRemaining: null,
    });
  }

  const quota = await getGuestListenQuota(request);
  return NextResponse.json({
    guest: true,
    exhausted: quota.exhausted,
    secondsListened: quota.secondsListened,
    secondsRemaining: quota.secondsRemaining,
    message: quota.exhausted ? quota.message : undefined,
  });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (user) {
    return NextResponse.json({
      guest: false,
      exhausted: false,
      secondsListened: 0,
      secondsRemaining: null,
    });
  }

  let deltaSeconds = 0;
  try {
    const body = (await request.json()) as { deltaSeconds?: number };
    deltaSeconds = Number(body.deltaSeconds) || 0;
  } catch {
    deltaSeconds = 0;
  }

  const quota =
    deltaSeconds > 0
      ? await addGuestListenSecondsServer(request, deltaSeconds)
      : await getGuestListenQuota(request);

  return NextResponse.json({
    guest: true,
    exhausted: quota.exhausted,
    secondsListened: quota.secondsListened,
    secondsRemaining: quota.secondsRemaining,
    message: quota.exhausted ? quota.message : undefined,
  });
}
