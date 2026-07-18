"use client";

import { useEffect, useState } from "react";

export type LocalizedPriceView = {
  formatted: string;
  currency: string;
  interval: string;
  country: string;
};

type PricingApiResponse = {
  formatted?: string | null;
  currency?: string;
  interval?: string;
  country?: string;
  unavailable?: boolean;
  error?: string;
};

/**
 * Loads the Stripe-backed Premium price for the visitor's country.
 * Falls back to a neutral label when pricing is unavailable.
 */
export function useLocalizedPrice() {
  const [price, setPrice] = useState<LocalizedPriceView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/stripe/pricing", { credentials: "include" });
        const data = (await res.json()) as PricingApiResponse;
        if (cancelled) return;

        if (res.ok && data.formatted) {
          setPrice({
            formatted: data.formatted,
            currency: data.currency ?? "gbp",
            interval: data.interval ?? "month",
            country: data.country ?? "GB",
          });
        } else {
          setPrice(null);
        }
      } catch {
        if (!cancelled) setPrice(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const amountLabel = price?.formatted ?? null;
  const perMonthLabel = amountLabel ? `${amountLabel}/mo` : "Premium";
  const monthlyCaption = amountLabel
    ? `${amountLabel} / ${price?.interval ?? "month"}`
    : "Premium membership";

  return { price, loading, amountLabel, perMonthLabel, monthlyCaption };
}
