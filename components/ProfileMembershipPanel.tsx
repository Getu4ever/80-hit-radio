"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StripeSubscriptionStatus } from "@/types/database.types";
import { useUserSession } from "@/hooks/useUserSession";
import { useAudioStore } from "@/store/useAudioStore";
import SyncSubscriptionBanner from "@/components/SyncSubscriptionBanner";

type Props = {
  email: string;
  role: string;
  memberSince: string;
  stripeStatus: StripeSubscriptionStatus;
  subscriptionLabel: string;
  trialDays: number;
  trialProgress: number;
  isPremium: boolean;
};

async function openStripe(endpoint: "/api/stripe/portal" | "/api/stripe/checkout") {
  if (endpoint === "/api/stripe/checkout") {
    await fetch("/api/stripe/sync", { method: "POST", credentials: "include" });
  }
  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Unable to open Stripe");
  }
  window.location.href = data.url;
}

export default function ProfileMembershipPanel({
  email,
  role,
  memberSince,
  stripeStatus,
  subscriptionLabel,
  trialDays,
  trialProgress,
  isPremium,
}: Props) {
  const router = useRouter();
  const { signOut, isAdmin } = useUserSession();
  const startRadio = useAudioStore((s) => s.startRadio);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTrack = useAudioStore((s) => s.currentTrack);

  const [busy, setBusy] = useState<"upgrade" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

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
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <SyncSubscriptionBanner currentStatus={stripeStatus} />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            Listener identity
          </p>
          <div className="mt-4 flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/80 to-cyan-400/80 font-[family-name:var(--font-display)] text-2xl font-bold text-[#07040f] shadow-[0_0_24px_rgba(34,211,238,0.35)]">
              {(email[0] ?? "8").toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-[family-name:var(--font-display)] text-2xl font-semibold text-white">
                {email.split("@")[0]}
              </h2>
              <p className="mt-1 truncate text-sm text-cyan-200/80">{email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wider text-white/60">
                  {role}
                </span>
                <span className="rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] uppercase tracking-wider text-cyan-200">
                  Since {memberSince}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-[#0a0614]/60 p-4">
              <p className="text-xs uppercase tracking-widest text-white/35">
                Stream status
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-lg text-white">
                {currentTrack && isPlaying
                  ? "On air — continuous"
                  : currentTrack
                    ? "Paused"
                    : "Ready to broadcast"}
              </p>
              <p className="mt-1 text-xs text-white/40">
                Music keeps playing across pages until you sign out.
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-[#0a0614]/60 p-4">
              <p className="text-xs uppercase tracking-widest text-white/35">
                Membership
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-lg text-cyan-200">
                {subscriptionLabel}
              </p>
              <p className="mt-1 text-xs text-white/40">
                Stripe status: {stripeStatus}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                if (!isPlaying) startRadio();
                router.push("/");
              }}
              className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(217,70,239,0.35)] transition hover:brightness-110"
            >
              {isPlaying ? "Back to radio deck" : "Start continuous radio"}
            </button>
            {isAdmin && (
              <Link
                href="/dashboard/admin"
                className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
              >
                Open studio control
              </Link>
            )}
          </div>
        </div>

        <div
          className={`rounded-2xl border p-6 ${
            isPremium
              ? "border-cyan-400/35 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10"
              : "border-fuchsia-400/25 bg-fuchsia-500/5"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                Plan & billing
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                {isPremium ? "Premium Membership" : "Free Trial Access"}
              </h2>
            </div>
            {isPremium ? (
              <span className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-cyan-300">
                Premium
              </span>
            ) : trialDays > 0 ? (
              <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
                {trialDays} days left
              </span>
            ) : (
              <span className="rounded-md border border-fuchsia-500/50 bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
                Trial expired
              </span>
            )}
          </div>

          {isPremium ? (
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              Unlimited continuous 80s streaming. Update your card, download
              receipts, or cancel Premium from Stripe&apos;s secure portal —
              Spotify-style control, without dark patterns.
            </p>
          ) : (
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs text-white/40">
                <span>Free trial progress</span>
                <span>{Math.round(trialProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width] duration-700"
                  style={{ width: `${trialProgress}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-white/50">
                After your free trial, Premium keeps the decade spinning without
                interruption.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {isPremium ? (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("portal", "/api/stripe/portal")}
                  className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy === "portal" ? "Opening portal…" : "Manage billing"}
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
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("upgrade", "/api/stripe/checkout")}
                  className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy === "upgrade" ? "Opening checkout…" : "Upgrade to Premium"}
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

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
          Session controls
        </h2>
        <p className="mt-1 text-sm text-white/45">
          Signing out stops the broadcast on this device. Navigating the lounge
          or studio does not.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-5 py-2.5 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/20"
          >
            Sign out & stop radio
          </button>
          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Return to on-air deck
          </Link>
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
              broadcast after your current billing period. Receipts, card
              updates, and final cancellation happen in Stripe&apos;s portal.
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
