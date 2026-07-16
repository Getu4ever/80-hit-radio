import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { syncProfileSubscriptionFromStripe } from "@/lib/stripe/sync";
import {
  formatSubscriptionLabel,
  getTrialDaysRemaining,
} from "@/lib/subscription";

/**
 * POST /api/stripe/sync
 * Reconciles the signed-in user's profile with live Stripe subscription data.
 */
export async function POST() {
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe/Supabase not configured" },
      { status: 503 },
    );
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updated = await syncProfileSubscriptionFromStripe(profile);
    if (!updated) {
      return NextResponse.json(
        { error: "Unable to update profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        stripeCustomerId: updated.stripe_customer_id,
        stripeSubscriptionStatus: updated.stripe_subscription_status,
        createdAt: updated.created_at,
        trialDaysLeft: getTrialDaysRemaining(updated.created_at),
        subscriptionLabel: formatSubscriptionLabel(updated),
      },
    });
  } catch (err) {
    console.error("stripe sync:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to sync subscription",
      },
      { status: 500 },
    );
  }
}
