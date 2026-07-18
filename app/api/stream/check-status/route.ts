import { NextResponse } from "next/server";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { getGuestListenQuota } from "@/lib/guestListenServer";
import {
  isStreamingEligible,
  getTrialDaysRemaining,
  getAccountAgeDays,
  TRIAL_DAYS,
} from "@/lib/subscription";

/**
 * GET /api/stream/check-status
 *
 * Guests: 1 free hour enforced server-side (IP hash + device cookie).
 * Signed-in users: trial / subscription entitlement (bypass guest hour).
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "ok",
      eligible: true,
      reason: "ok",
      localDevBypass: true,
    });
  }

  const user = await getAuthUser();

  if (!user) {
    const quota = await getGuestListenQuota(request);
    if (quota.exhausted) {
      return NextResponse.json(
        {
          status: "denied",
          eligible: false,
          reason: "guest_limit",
          guest: true,
          guestSecondsListened: quota.secondsListened,
          guestSecondsRemaining: 0,
          message: quota.message,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      status: "ok",
      eligible: true,
      reason: "ok",
      guest: true,
      guestSecondsListened: quota.secondsListened,
      guestSecondsRemaining: quota.secondsRemaining,
      message: "Listening as guest. Sign in to save your free trial.",
    });
  }

  const profile = await getCurrentProfile();

  if (profile) {
    const { eligible, reason, accountAgeDays } = isStreamingEligible(profile);

    if (!eligible) {
      return NextResponse.json(
        {
          status: "denied",
          eligible: false,
          reason: "trial_expired",
          error: "Access Denied",
          message:
            reason ??
            "Your free trial has expired. Subscribe now to keep rocking the 80s!",
          accountAgeDays,
          stripeSubscriptionStatus: profile.stripe_subscription_status,
          trialDaysRemaining: 0,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      status: "ok",
      eligible: true,
      reason: "ok",
      accountAgeDays,
      stripeSubscriptionStatus: profile.stripe_subscription_status,
      trialDaysRemaining: getTrialDaysRemaining(profile.created_at),
      role: profile.role,
    });
  }

  const createdAt = user.created_at;
  const accountAgeDays = getAccountAgeDays(createdAt);
  if (accountAgeDays > TRIAL_DAYS) {
    return NextResponse.json(
      {
        status: "denied",
        eligible: false,
        reason: "trial_expired",
        error: "Access Denied",
        message:
          "Your free trial has expired. Subscribe now to keep rocking the 80s!",
        accountAgeDays,
        trialDaysRemaining: 0,
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    status: "ok",
    eligible: true,
    reason: "ok",
    accountAgeDays,
    trialDaysRemaining: getTrialDaysRemaining(createdAt),
    role: "user",
  });
}
