import Stripe from "stripe";
import { updateProfileById } from "@/lib/auth/session";
import { getStripe } from "@/lib/stripe";
import type { Profile } from "@/types/database.types";

function isMissingStripeResource(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    err.code === "resource_missing"
  );
}

/**
 * Returns a customer ID that exists in the current Stripe mode (test/live).
 * Clears stale IDs left over from switching modes (e.g. test → live).
 */
export async function ensureStripeCustomerForProfile(
  profile: Profile,
): Promise<string> {
  const stripe = getStripe();
  let customerId = profile.stripe_customer_id;

  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if (!("deleted" in existing && existing.deleted)) {
        return customerId;
      }
    } catch (err) {
      if (!isMissingStripeResource(err)) throw err;
    }
  }

  const customer = await stripe.customers.create({
    email: profile.email,
    metadata: { supabase_user_id: profile.id },
  });

  await updateProfileById(profile.id, {
    stripe_customer_id: customer.id,
  });

  return customer.id;
}
