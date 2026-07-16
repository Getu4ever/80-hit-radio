import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  formatSubscriptionLabel,
  getTrialDaysRemaining,
} from "@/lib/subscription";

function serializeProfile(
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>,
) {
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    stripeCustomerId: profile.stripe_customer_id,
    stripeSubscriptionStatus: profile.stripe_subscription_status,
    createdAt: profile.created_at,
    trialDaysLeft: getTrialDaysRemaining(profile.created_at),
    subscriptionLabel: formatSubscriptionLabel(profile),
  };
}

/** GET — hydrate client session from Supabase Auth + profiles. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ user: null, localDevBypass: true });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: serializeProfile(profile) });
}

/** POST — sign out the Supabase session. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "signOut";
  };

  if (body.action !== "signOut") {
    return NextResponse.json(
      { error: "Use /auth/login or /auth/signup to authenticate." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ user: null, localDevBypass: true });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ user: null });
}
