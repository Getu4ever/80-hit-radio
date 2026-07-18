import { NextResponse } from "next/server";
import { getCurrentProfile, updateProfileById } from "@/lib/auth/session";
import { detectCountryFromHeaders } from "@/lib/geo/country";
import {
  getAppUrl,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import {
  currencyForCountry,
  getStripePriceIdForCurrency,
} from "@/lib/stripe/pricing";

/** POST — create a Stripe Checkout session for Premium (local currency Price). */
export async function POST(request: Request) {
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

  const country = detectCountryFromHeaders(request.headers);
  const currency = currencyForCountry(country);
  const priceId = getStripePriceIdForCurrency(currency);

  const stripe = getStripe();
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
    metadata: {
      supabase_user_id: profile.id,
      presentment_country: country,
      presentment_currency: currency,
    },
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
