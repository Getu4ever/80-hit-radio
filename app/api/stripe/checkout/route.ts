import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { detectCountryFromHeaders } from "@/lib/geo/country";
import {
  getAppUrl,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { ensureStripeCustomerForProfile } from "@/lib/stripe/customer";
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

  try {
    const country = detectCountryFromHeaders(request.headers);
    const currency = currencyForCountry(country);
    const priceId = getStripePriceIdForCurrency(currency);

    const stripe = getStripe();
    const appUrl = getAppUrl();
    const customerId = await ensureStripeCustomerForProfile(profile);

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
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to start checkout";
    console.error("Stripe checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
