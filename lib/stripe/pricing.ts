/**
 * Country → presentment currency → Stripe Price ID.
 *
 * Amounts always come from Stripe Price objects (no app-side FX).
 * Create one recurring monthly Price per currency in the Stripe Dashboard
 * and set STRIPE_PRICE_ID_{CURRENCY}. STRIPE_PRICE_ID is the GBP default.
 */

import type Stripe from "stripe";
import { getStripePriceId, serverEnv } from "@/lib/env";

export const SUPPORTED_CURRENCIES = ["gbp", "usd", "eur"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: SupportedCurrency = "gbp";

/** ISO country → presentment currency. Unknown countries use DEFAULT_CURRENCY. */
const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  // GBP
  GB: "gbp",
  GG: "gbp",
  IM: "gbp",
  JE: "gbp",

  // USD
  US: "usd",
  PR: "usd",
  GU: "usd",
  AS: "usd",
  VI: "usd",
  UM: "usd",
  MH: "usd",
  FM: "usd",
  PW: "usd",

  // EUR — eurozone + common EUR presentment markets
  AT: "eur",
  BE: "eur",
  CY: "eur",
  DE: "eur",
  EE: "eur",
  ES: "eur",
  FI: "eur",
  FR: "eur",
  GR: "eur",
  HR: "eur",
  IE: "eur",
  IT: "eur",
  LT: "eur",
  LU: "eur",
  LV: "eur",
  MT: "eur",
  NL: "eur",
  PT: "eur",
  SI: "eur",
  SK: "eur",
  AD: "eur",
  MC: "eur",
  SM: "eur",
  VA: "eur",
  XK: "eur",
  ME: "eur",
};

export type LocalizedPrice = {
  country: string;
  requestedCurrency: SupportedCurrency;
  currency: string;
  unitAmount: number;
  formatted: string;
  interval: string;
  priceId: string;
};

export function currencyForCountry(country: string): SupportedCurrency {
  const code = country.trim().toUpperCase();
  return COUNTRY_TO_CURRENCY[code] ?? DEFAULT_CURRENCY;
}

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Resolve Stripe Price ID for a currency.
 * Falls back to STRIPE_PRICE_ID when a market-specific price is unset.
 */
export function getStripePriceIdForCurrency(currency: SupportedCurrency): string {
  const key = `STRIPE_PRICE_ID_${currency.toUpperCase()}`;
  const specific = serverEnv(key);
  if (specific) return specific;
  return getStripePriceId();
}

export function formatStripeAmount(
  unitAmount: number,
  currency: string,
  locale = "en-GB",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100);
}

export function localizedPriceFromStripePrice(
  price: Stripe.Price,
  country: string,
  requestedCurrency: SupportedCurrency,
): LocalizedPrice {
  const unitAmount = price.unit_amount ?? 0;
  const currency = (price.currency || requestedCurrency).toLowerCase();
  const interval = price.recurring?.interval ?? "month";

  return {
    country,
    requestedCurrency,
    currency,
    unitAmount,
    formatted: formatStripeAmount(unitAmount, currency),
    interval,
    priceId: price.id,
  };
}
