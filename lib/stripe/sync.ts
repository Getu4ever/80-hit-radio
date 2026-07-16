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
