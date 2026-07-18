import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getCurrentProfile } from "@/lib/auth/session";
import { getAppUrl, isStripeConfigured, isSupabaseConfigured } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { getManagedSubscriptionForCustomer } from "@/lib/stripe/sync";

type PortalFlow = "default" | "payment_method" | "cancel";

/** POST — open Stripe Customer Portal (optional deep-link flow). */
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

  if (!profile.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Subscribe first." },
      { status: 400 },
    );
  }

  let flow: PortalFlow = "default";
  try {
    const body = (await request.json()) as { flow?: string };
    if (
      body.flow === "payment_method" ||
      body.flow === "cancel" ||
      body.flow === "default"
    ) {
      flow = body.flow;
    }
  } catch {
    // Empty body is fine — open the full portal homepage.
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();
  const returnUrl = `${appUrl}/dashboard/billing`;

  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: profile.stripe_customer_id,
    return_url: returnUrl,
  };

  if (flow === "payment_method") {
    params.flow_data = {
      type: "payment_method_update",
      after_completion: {
        type: "redirect",
        redirect: { return_url: returnUrl },
      },
    };
  } else if (flow === "cancel") {
    const subscription = await getManagedSubscriptionForCustomer(
      profile.stripe_customer_id,
    );
    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found to cancel." },
        { status: 400 },
      );
    }
    params.flow_data = {
      type: "subscription_cancel",
      subscription_cancel: { subscription: subscription.id },
      after_completion: {
        type: "redirect",
        redirect: { return_url: returnUrl },
      },
    };
  }

  const portal = await stripe.billingPortal.sessions.create(params);

  return NextResponse.json({ url: portal.url });
}
