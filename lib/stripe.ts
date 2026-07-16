import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/env";

let stripe: Stripe | null = null;

export function getStripe() {
  if (!stripe) {
    stripe = new Stripe(getStripeSecretKey());
  }
  return stripe;
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): "active" | "trialing" | "canceled" | "past_due" | "none" {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}
