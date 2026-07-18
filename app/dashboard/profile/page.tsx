import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { displayNameForProfile } from "@/lib/profile/identity";
import { getTrialDaysRemaining, TRIAL_DAYS } from "@/lib/subscription";
import DashboardChrome from "@/components/DashboardChrome";
import ProfileMembershipPanel from "@/components/ProfileMembershipPanel";

export const dynamic = "force-dynamic";

export default async function ProfileDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/auth/login");
  }

  const trialDays = getTrialDaysRemaining(profile.created_at);
  const isPremium = profile.stripe_subscription_status === "active";
  const created = new Date(profile.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const trialProgress = Math.min(
    100,
    Math.max(0, ((TRIAL_DAYS - trialDays) / TRIAL_DAYS) * 100),
  );
  const displayName = displayNameForProfile(profile);

  return (
    <div className="min-h-screen bg-[#07040f] px-4 py-6 pb-28 text-white sm:px-8 sm:py-8">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-cyan-500/15 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <DashboardChrome
          eyebrow="Listener Lounge"
          title="Community dial"
          subtitle="Your station membership — profile, listening presence, and billing — for the old-school radio community."
        />

        <ProfileMembershipPanel
          email={profile.email}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
          displayName={displayName}
          memberSince={created}
          stripeStatus={profile.stripe_subscription_status}
          hasStripeCustomer={Boolean(profile.stripe_customer_id)}
          trialDays={trialDays}
          trialProgress={trialProgress}
          isPremium={isPremium}
        />
      </div>
    </div>
  );
}
