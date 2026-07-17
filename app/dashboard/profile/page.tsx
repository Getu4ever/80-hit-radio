import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  formatSubscriptionLabel,
  getTrialDaysRemaining,
  TRIAL_DAYS,
} from "@/lib/subscription";
import DashboardChrome from "@/components/DashboardChrome";
import ProfileMembershipPanel from "@/components/ProfileMembershipPanel";

export const dynamic = "force-dynamic";

export default async function ProfileDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/auth/login");
  }

  const trialDays = getTrialDaysRemaining(profile.created_at);
  const label = formatSubscriptionLabel(profile);
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

  return (
    <div className="min-h-screen bg-[#07040f] px-4 py-10 pb-32 text-white sm:px-8">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-cyan-500/15 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <DashboardChrome
          eyebrow="Listener lounge"
          title="Your membership"
          subtitle="Control billing, keep the broadcast rolling, and sign out only when you're ready to kill the stream."
        />

        <ProfileMembershipPanel
          email={profile.email}
          role={profile.role}
          memberSince={created}
          stripeStatus={profile.stripe_subscription_status}
          subscriptionLabel={label}
          trialDays={trialDays}
          trialProgress={trialProgress}
          isPremium={isPremium}
        />
      </div>
    </div>
  );
}
