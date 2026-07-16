import { NextResponse } from "next/server";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import {
  isStreamingEligible,
  getTrialDaysRemaining,
  getAccountAgeDays,
  TRIAL_DAYS,
} from "@/lib/subscription";

/**
 * GET /api/stream/check-status
 *
 * TEMP (local usability): guests can stream.
 * Signed-in users still get trial / subscription checks.
 * Re-tighten to require login once auth is stable.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "ok",
      eligible: true,
      reason: "ok",
      localDevBypass: true,
    });
  }

  const user = await getAuthUser();

  // Guests can use the radio (no full-screen lock).
  if (!user) {
    return NextResponse.json({
      status: "ok",
      eligible: true,
      reason: "ok",
      guest: true,
      message: "Listening as guest. Sign in to save your free month.",
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
            "Your free month has expired. Subscribe now to keep rocking the 80s!",
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
          "Your free month has expired. Subscribe now to keep rocking the 80s!",
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
