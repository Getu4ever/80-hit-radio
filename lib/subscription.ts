import type { Profile, StripeSubscriptionStatus } from "@/types/database.types";

export const TRIAL_DAYS = 30;

export function getAccountAgeDays(createdAt: string, now = new Date()): number {
  const created = new Date(createdAt).getTime();
  const diffMs = now.getTime() - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getTrialDaysRemaining(
  createdAt: string,
  now = new Date(),
): number {
  const age = getAccountAgeDays(createdAt, now);
  return Math.max(0, TRIAL_DAYS - age);
}

/**
 * Streaming eligibility:
 * - Within first 30 days of account → allowed (free trial)
 * - After 30 days → only `active` Stripe subscriptions may stream
 */
export function isStreamingEligible(
  profile: Pick<Profile, "created_at" | "stripe_subscription_status">,
  now = new Date(),
): { eligible: boolean; reason: string | null; accountAgeDays: number } {
  const accountAgeDays = getAccountAgeDays(profile.created_at, now);
  const status = profile.stripe_subscription_status;

  if (accountAgeDays <= TRIAL_DAYS) {
    return { eligible: true, reason: null, accountAgeDays };
  }

  if (status === "active") {
    return { eligible: true, reason: null, accountAgeDays };
  }

  return {
    eligible: false,
    reason:
      "Your free month has expired. Subscribe now to keep rocking the 80s!",
    accountAgeDays,
  };
}

export function isPaidStatus(status: StripeSubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

export function formatSubscriptionLabel(
  profile: Pick<Profile, "created_at" | "stripe_subscription_status">,
): string {
  if (profile.stripe_subscription_status === "active") {
    return "Premium Member";
  }
  if (profile.stripe_subscription_status === "trialing") {
    return "Stripe Trialling";
  }

  const remaining = getTrialDaysRemaining(profile.created_at);
  if (remaining > 0) {
    return `Trial: ${remaining} day${remaining === 1 ? "" : "s"} left`;
  }

  return "Trial expired";
}
