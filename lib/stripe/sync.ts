import type Stripe from "stripe";
import { getStripe, mapStripeSubscriptionStatus } from "@/lib/stripe";
import { updateProfileById } from "@/lib/auth/session";
import type { Profile } from "@/types/database.types";

/**
 * Pull the latest subscription state from Stripe and write it to profiles.
 * Used by the thank-you page when webhooks were missed (common in local dev).
 */
export async function syncProfileSubscriptionFromStripe(
  profile: Profile,
): Promise<Profile | null> {
  const stripe = getStripe();

  let customerId = profile.stripe_customer_id;

  if (!customerId) {
    const customers = await stripe.customers.list({
      email: profile.email,
      limit: 5,
    });
    const match =
      customers.data.find((c) => c.metadata?.supabase_user_id === profile.id) ??
      customers.data[0];
    customerId = match?.id ?? null;
  }

  if (!customerId) {
    return profile;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const preferred =
    subscriptions.data.find((s) => s.status === "active") ??
    subscriptions.data.find((s) => s.status === "trialing") ??
    subscriptions.data[0];

  const status = preferred
    ? mapStripeSubscriptionStatus(preferred.status)
    : "none";

  if (preferred?.metadata?.supabase_user_id !== profile.id && preferred) {
    await stripe.subscriptions.update(preferred.id, {
      metadata: {
        ...preferred.metadata,
        supabase_user_id: profile.id,
      },
    });
  }

  return updateProfileById(profile.id, {
    stripe_customer_id: customerId,
    stripe_subscription_status: status,
  });
}

export async function getActiveSubscriptionForCustomer(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  return subscriptions.data[0] ?? null;
}

/** Prefer active → trialing → past_due for portal deep links / billing UI. */
export async function getManagedSubscriptionForCustomer(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  // Stripe allows at most 4 expand levels. Listing already prefixes `data.`,
  // so `data.items.data.price.product` (5) throws property_expansion_max_depth.
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.default_payment_method", "data.items.data.price"],
  });

  return (
    subscriptions.data.find((s) => s.status === "active") ??
    subscriptions.data.find((s) => s.status === "trialing") ??
    subscriptions.data.find((s) => s.status === "past_due") ??
    subscriptions.data[0] ??
    null
  );
}

export type BillingSummary = {
  subscriptionId: string | null;
  planName: string;
  priceLabel: string | null;
  status: Stripe.Subscription.Status | "none";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  paymentMethodLabel: string | null;
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function paymentMethodLabel(
  pm: Stripe.PaymentMethod | string | null | undefined,
): string | null {
  if (!pm || typeof pm === "string") return null;
  if (pm.type === "card" && pm.card) {
    const brand = pm.card.brand
      ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
      : "Card";
    return `${brand} ···· ${pm.card.last4}`;
  }
  return pm.type ? pm.type.replace(/_/g, " ") : null;
}

const EMPTY_BILLING_SUMMARY: BillingSummary = {
  subscriptionId: null,
  planName: "RithmGen Premium",
  priceLabel: null,
  status: "none",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  paymentMethodLabel: null,
};

export async function getBillingSummaryForCustomer(
  customerId: string,
): Promise<BillingSummary> {
  try {
    const stripe = getStripe();
    const subscription = await getManagedSubscriptionForCustomer(customerId);

    if (!subscription) {
      return EMPTY_BILLING_SUMMARY;
    }

    const item = subscription.items.data[0];
    const price = item?.price;
    const productRef = price?.product;

    let productName: string | null = null;
    if (typeof productRef === "object" && productRef && !productRef.deleted) {
      productName = productRef.name;
    } else if (typeof productRef === "string") {
      try {
        const product = await stripe.products.retrieve(productRef);
        if (!product.deleted) productName = product.name;
      } catch {
        // Keep default plan name if product lookup fails.
      }
    }

    let priceLabel: string | null = null;
    if (price?.unit_amount != null && price.currency) {
      const money = formatMoney(price.unit_amount, price.currency);
      const interval = price.recurring?.interval;
      priceLabel = interval ? `${money} per ${interval}` : money;
    }

    let pm: Stripe.PaymentMethod | string | null =
      subscription.default_payment_method;

    if (!pm || typeof pm === "string") {
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (!customer.deleted) {
        pm = customer.invoice_settings?.default_payment_method ?? null;
      }
    }

    // Stripe API 2025+ moved period end onto subscription items.
    const periodEndUnix =
      item && "current_period_end" in item
        ? (item.current_period_end as number | undefined)
        : (subscription as { current_period_end?: number }).current_period_end;
    const periodEnd = periodEndUnix
      ? new Date(periodEndUnix * 1000).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;

    return {
      subscriptionId: subscription.id,
      planName: productName || "RithmGen Premium",
      priceLabel,
      status: subscription.status,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: periodEnd,
      paymentMethodLabel: paymentMethodLabel(pm),
    };
  } catch (err) {
    console.error("[billing] getBillingSummaryForCustomer failed:", err);
    return EMPTY_BILLING_SUMMARY;
  }
}
