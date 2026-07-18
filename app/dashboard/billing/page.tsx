import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { isStripeConfigured } from "@/lib/env";
import { getBillingSummaryForCustomer } from "@/lib/stripe/sync";
import DashboardChrome from "@/components/DashboardChrome";
import BillingMembershipPanel from "@/components/BillingMembershipPanel";

export const dynamic = "force-dynamic";

export default async function BillingDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/auth/login?next=/dashboard/billing");
  }

  const isPremium = profile.stripe_subscription_status === "active";

  const summary =
    profile.stripe_customer_id && isStripeConfigured()
      ? await getBillingSummaryForCustomer(profile.stripe_customer_id)
      : {
          subscriptionId: null,
          planName: "RithmGen Premium",
          priceLabel: null,
          status: "none" as const,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          paymentMethodLabel: null,
        };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#07040f] px-4 py-6 pb-28 text-white sm:px-8 sm:py-8">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-40"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-cyan-500/15 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <DashboardChrome
          eyebrow="Billing"
          title="Manage your RithmGen Premium membership"
          subtitle="Your branded membership home — the broadcast keeps playing here. Card updates and cancellation open Stripe in a new tab."
          logoSize="xl"
        />

        <BillingMembershipPanel
          email={profile.email}
          stripeStatus={profile.stripe_subscription_status}
          hasStripeCustomer={Boolean(profile.stripe_customer_id)}
          isPremium={isPremium}
          planName={summary.planName}
          priceLabel={summary.priceLabel}
          currentPeriodEnd={summary.currentPeriodEnd}
          paymentMethodLabel={summary.paymentMethodLabel}
          cancelAtPeriodEnd={summary.cancelAtPeriodEnd}
        />
      </div>
    </div>
  );
}
