import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  updateProfileById,
  updateProfileByStripeCustomerId,
} from "@/lib/auth/session";
import { getStripe, mapStripeSubscriptionStatus } from "@/lib/stripe";
import {
  getStripeWebhookSecret,
  isStripeConfigured,
  isStripeWebhookConfigured,
} from "@/lib/env";

export const runtime = "nodejs";

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const status = mapStripeSubscriptionStatus(subscription.status);
  const userId = subscription.metadata?.supabase_user_id;

  const patch = {
    stripe_customer_id: customerId,
    stripe_subscription_status: status,
  };

  if (userId) {
    await updateProfileById(userId, patch);
    return;
  }

  await updateProfileByStripeCustomerId(customerId, {
    stripe_subscription_status: status,
  });
}

/**
 * POST /api/stripe/webhook
 * Keeps `profiles.stripe_subscription_status` in sync with Stripe.
 */
export async function POST(request: Request) {
  if (!isStripeWebhookConfigured() || !isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe webhook is not configured. Add STRIPE_* keys to .env.local.",
      },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Stripe webhook signature error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const userId =
          session.client_reference_id ??
          session.metadata?.supabase_user_id ??
          null;

        if (userId && customerId) {
          await updateProfileById(userId, {
            stripe_customer_id: customerId,
            stripe_subscription_status: "active",
          });
        } else if (customerId) {
          await updateProfileByStripeCustomerId(customerId, {
            stripe_subscription_status: "active",
          });
        }

        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
