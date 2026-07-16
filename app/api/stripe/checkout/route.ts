import { NextResponse } from "next/server";
import { getCurrentProfile, updateProfileById } from "@/lib/auth/session";
import {
  getAppUrl,
  getStripePriceId,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { getStripe } from "@/lib/stripe";

/** POST — create a Stripe Checkout session for Premium. */
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

  const stripe = getStripe();
  const priceId = getStripePriceId();
  const appUrl = getAppUrl();

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { supabase_user_id: profile.id },
    });
    customerId = customer.id;
    await updateProfileById(profile.id, { stripe_customer_id: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    client_reference_id: profile.id,
    metadata: { supabase_user_id: profile.id },
    subscription_data: {
      metadata: { supabase_user_id: profile.id },
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Unable to create checkout session" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url });
}
