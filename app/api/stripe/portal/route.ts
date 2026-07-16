import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getAppUrl, isStripeConfigured, isSupabaseConfigured } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

/** POST — open Stripe Customer Portal for subscription management. */
export async function POST() {
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe/Supabase keys are not configured yet. Add them to .env.local (see GO_LIVE.md).",
      },
      { status: 503 },
    );
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!profile.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Subscribe first." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();

  const portal = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/dashboard/profile`,
  });

  return NextResponse.json({ url: portal.url });
}
