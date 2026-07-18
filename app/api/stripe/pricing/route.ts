import { NextResponse } from "next/server";
import { detectCountryFromHeaders } from "@/lib/geo/country";
import { isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import {
  currencyForCountry,
  getStripePriceIdForCurrency,
  localizedPriceFromStripePrice,
} from "@/lib/stripe/pricing";

/**
 * GET — localized Premium price for the requestor's country.
 * Amounts come from Stripe Price objects (no FX in the app).
 */
export async function GET(request: Request) {
  const country = detectCountryFromHeaders(request.headers);
  const requestedCurrency = currencyForCountry(country);

  if (!isStripeConfigured()) {
    return NextResponse.json({
      country,
      requestedCurrency,
      currency: requestedCurrency,
      unitAmount: null,
      formatted: null,
      interval: "month",
      unavailable: true,
    });
  }

  try {
    const priceId = getStripePriceIdForCurrency(requestedCurrency);
    const price = await getStripe().prices.retrieve(priceId);

    if (!price.active || price.type !== "recurring") {
      return NextResponse.json(
        { error: "Configured Stripe price is not an active recurring price" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      localizedPriceFromStripePrice(price, country, requestedCurrency),
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load pricing" },
      { status: 503 },
    );
  }
}
