"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StripeSubscriptionStatus } from "@/types/database.types";
import { initialsForName } from "@/lib/profile/identity";
import { useUserSession, useUserSessionStore } from "@/hooks/useUserSession";
import { useAudioStore } from "@/store/useAudioStore";
import SyncSubscriptionBanner from "@/components/SyncSubscriptionBanner";
import { openExternalUrl } from "@/lib/openExternalUrl";

type Props = {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  displayName: string;
  memberSince: string;
  stripeStatus: StripeSubscriptionStatus;
  hasStripeCustomer: boolean;
  trialDays: number;
  trialProgress: number;
  isPremium: boolean;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

async function openStripe(endpoint: "/api/stripe/portal" | "/api/stripe/checkout") {
  if (endpoint === "/api/stripe/checkout") {
    await fetch("/api/stripe/sync", { method: "POST", credentials: "include" });
  }
  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body:
      endpoint === "/api/stripe/portal"
        ? JSON.stringify({ flow: "cancel" })
        : undefined,
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Unable to open Stripe");
  }
  // Portal (and checkout from the lounge) open in a new tab so the player keeps playing.
  openExternalUrl(data.url);
}

export default function ProfileMembershipPanel({
  email,
  fullName,
  avatarUrl: initialAvatarUrl,
  displayName: initialDisplayName,
  memberSince,
  stripeStatus,
  hasStripeCustomer,
  trialDays,
  trialProgress,
  isPremium,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false,
}: Props) {
  const isPastDue = stripeStatus === "past_due";
  const isOnTrial = !isPremium && !isPastDue && trialDays > 0;
  const membershipTitle = isPremium
    ? "Premium Member"
    : isPastDue
      ? "Past due"
      : isOnTrial
        ? "Free Trial Access"
        : "No active plan";
  // Short status for welcome — trial countdown lives only in Membership badge
  const welcomeStatus = isPremium
    ? "Member"
    : isPastDue
      ? "Past due"
      : isOnTrial
        ? "Free trial"
        : "No active plan";
  const router = useRouter();
  const { signOut, isAdmin } = useUserSession();
  const setUser = useUserSessionStore((s) => s.setUser);
  const sessionUser = useUserSessionStore((s) => s.user);
  const startRadio = useAudioStore((s) => s.startRadio);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTrack = useAudioStore((s) => s.currentTrack);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nameDraft, setNameDraft] = useState(fullName ?? initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState<"upgrade" | "portal" | "profile" | "avatar" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const streamLabel =
    currentTrack && isPlaying
      ? "Tuned in — continuous"
      : currentTrack
        ? "Paused on the dial"
        : "Ready to tune in";

  function patchSession(next: { displayName?: string; avatarUrl?: string | null }) {
    if (!sessionUser) return;
    setUser({
      ...sessionUser,
      displayName: next.displayName ?? sessionUser.displayName,
      avatarUrl:
        next.avatarUrl !== undefined ? next.avatarUrl : sessionUser.avatarUrl,
    });
  }

  async function run(
    kind: "upgrade" | "portal",
    endpoint: "/api/stripe/portal" | "/api/stripe/checkout",
  ) {
    setBusy(kind);
    setError(null);
    try {
      await openStripe(endpoint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy("profile");
    setError(null);
    setProfileInfo(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: nameDraft.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        profile?: { full_name?: string | null };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to save profile");
      }
      const nextName = data.profile?.full_name?.trim() || nameDraft.trim();
      setDisplayName(nextName);
      setNameDraft(nextName);
      patchSession({ displayName: nextName });
      setProfileInfo("Name saved — welcome to the lounge.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile");
    } finally {
      setBusy(null);
    }
  }

  async function onAvatarSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy("avatar");
    setError(null);
    setProfileInfo(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        avatarUrl?: string;
      };
      if (!res.ok || !data.avatarUrl) {
        throw new Error(data.error ?? "Unable to upload photo");
      }
      setAvatarUrl(data.avatarUrl);
      patchSession({ avatarUrl: data.avatarUrl });
      setProfileInfo("Profile picture updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload photo");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <SyncSubscriptionBanner
        currentStatus={stripeStatus}
        hasStripeCustomer={hasStripeCustomer}
      />

      <section className="animate-fade-up border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              On the dial
            </p>
            <h2 className="mt-1 truncate font-[family-name:var(--font-display)] text-2xl font-semibold text-white sm:text-3xl">
              Welcome, {displayName.split(" ")[0] || displayName}
            </h2>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-white/50">
              You&apos;re part of the RithmGen listener community — continuous
              classic hits, the way radio used to feel.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
              <span className="text-cyan-200/90">{welcomeStatus}</span>
              <span aria-hidden>·</span>
              <span>Member since {memberSince}</span>
              <span aria-hidden>·</span>
              <span>{streamLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                if (!isPlaying) startRadio();
                router.push("/");
              }}
              className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(217,70,239,0.35)] transition hover:brightness-110"
            >
              {isPlaying ? "Back to On Air" : "Tune in"}
            </button>
            {isAdmin && (
              <Link
                href="/dashboard/admin"
                className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
              >
                Studio Control
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="animate-fade-up space-y-5" style={{ animationDelay: "80ms" }}>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Your listener profile
            </p>
            <h3 className="mt-1.5 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
              Name & photo
            </h3>
            <p className="mt-1 text-sm text-white/45">
              How you appear across the lounge. Google photos show by default
              until you upload your own.
            </p>
          </div>

          <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-fuchsia-500/70 to-cyan-400/70 text-lg font-bold text-[#07040f]"
                aria-label={
                  avatarUrl
                    ? `${displayName}'s profile picture`
                    : `${displayName}'s initials`
                }
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initialsForName(displayName)
                )}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void onAvatarSelected(e)}
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-60"
                >
                  {busy === "avatar" ? "Uploading…" : "Upload photo"}
                </button>
                <p className="mt-1.5 text-xs text-white/35">
                  JPG, PNG, WebP or GIF · under 2 MB
                </p>
              </div>
            </div>

            <label className="block text-sm text-white/70">
              Full name
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="mt-1.5 w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-fuchsia-400/50"
                autoComplete="name"
              />
            </label>

            <label className="block text-sm text-white/45">
              Email
              <input
                type="email"
                value={email}
                disabled
                className="mt-1.5 w-full max-w-md cursor-not-allowed rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-white/50"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy !== null}
                className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {busy === "profile" ? "Saving…" : "Save profile"}
              </button>
            </div>
            {profileInfo && (
              <p className="text-sm text-cyan-200/90">{profileInfo}</p>
            )}
          </form>
        </div>

        <div
          className={`animate-fade-up border-l-0 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 ${
            isPremium ? "lg:border-cyan-400/20" : "lg:border-fuchsia-400/20"
          }`}
          style={{ animationDelay: "140ms" }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            Membership
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
              {membershipTitle}
            </h3>
            {isPremium ? (
              <span className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-cyan-300">
                Member
              </span>
            ) : isPastDue ? (
              <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-200">
                Past due
              </span>
            ) : isOnTrial ? (
              <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
                {trialDays} days left
              </span>
            ) : (
              <span className="rounded-md border border-fuchsia-500/50 bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
                No active plan
              </span>
            )}
          </div>

          {isPremium ? (
            <div className="mt-4 space-y-2">
              {currentPeriodEnd && (
                <p className="text-sm font-medium text-cyan-200/90">
                  {cancelAtPeriodEnd
                    ? `Access until ${currentPeriodEnd}`
                    : `Renews on ${currentPeriodEnd}`}
                </p>
              )}
              <p className="text-sm leading-relaxed text-white/55">
                Unlimited continuous streaming. Manage your card, receipts, or
                cancel from your branded billing page — music keeps playing.
              </p>
            </div>
          ) : isPastDue ? (
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              We couldn&apos;t renew your membership. Update billing to keep the
              continuous 80s broadcast unlocked.
            </p>
          ) : isOnTrial ? (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs text-white/40">
                <span>Free trial progress</span>
                <span>{Math.round(trialProgress)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width] duration-700"
                  style={{ width: `${trialProgress}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-white/50">
                After your trial, Premium keeps the decade spinning without
                interruption.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              Start a membership anytime for uninterrupted classic hits — cancel
              whenever you like from billing.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3">
            {isPremium ? (
              <>
                <button
                  type="button"
                  onClick={() => openExternalUrl("/dashboard/billing")}
                  className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110"
                >
                  Manage billing
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setCancelOpen(true)}
                  className="rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-medium text-white/70 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-fuchsia-200 disabled:opacity-60"
                >
                  Cancel membership
                </button>
              </>
            ) : isPastDue && hasStripeCustomer ? (
              <>
                <button
                  type="button"
                  onClick={() => openExternalUrl("/dashboard/billing")}
                  className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110"
                >
                  Update billing
                </button>
                <Link
                  href="/pricing"
                  className="text-center text-xs text-cyan-300/70 underline-offset-2 hover:underline"
                >
                  View plans
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("upgrade", "/api/stripe/checkout")}
                  className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy === "upgrade" ? "Opening checkout…" : "Start membership"}
                </button>
                <Link
                  href="/pricing"
                  className="text-center text-xs text-cyan-300/70 underline-offset-2 hover:underline"
                >
                  Compare plans
                </Link>
              </>
            )}
            {error && <p className="text-xs text-fuchsia-300">{error}</p>}
          </div>
        </div>
      </section>

      <section className="animate-fade-up border-t border-white/10 pt-5" style={{ animationDelay: "200ms" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
              Session & help
            </h3>
            <p className="mt-1 text-sm text-white/45">
              Signing out stops the broadcast on this device. Need a hand? Visit
              Help or email the station desk.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/help"
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
            >
              Help & support
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-5 py-2.5 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/20"
            >
              Sign out & stop radio
            </button>
          </div>
        </div>
      </section>

      {cancelOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-membership-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0614] p-6 shadow-[0_0_40px_rgba(217,70,239,0.2)]">
            <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/70">
              Before you go
            </p>
            <h3
              id="cancel-membership-title"
              className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white"
            >
              Cancel Premium?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              You&apos;ll lose uninterrupted access to the continuous 80s
              broadcast after your current billing period. Final cancellation
              opens Stripe in a new tab so the music keeps playing here.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li className="flex gap-2">
                <span className="text-cyan-400">·</span>
                Non-stop Pop, Rock, Hip-Hop, R&B & more
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400">·</span>
                Playback that survives every page until you sign out
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400">·</span>
                Listener lounge membership controls
              </li>
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Keep Premium
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("portal", "/api/stripe/portal")}
                className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                {busy === "portal"
                  ? "Opening cancel portal…"
                  : "Continue to cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
