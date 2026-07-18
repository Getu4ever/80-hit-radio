"use client";

import { useState } from "react";
import Link from "next/link";
import type { StripeSubscriptionStatus } from "@/types/database.types";
import SyncSubscriptionBanner from "@/components/SyncSubscriptionBanner";
import { openExternalUrl } from "@/lib/openExternalUrl";

type PortalFlow = "default" | "payment_method" | "cancel";

type Props = {
  email: string;
  stripeStatus: StripeSubscriptionStatus;
  hasStripeCustomer: boolean;
  isPremium: boolean;
  planName: string;
  priceLabel: string | null;
  currentPeriodEnd: string | null;
  paymentMethodLabel: string | null;
  cancelAtPeriodEnd: boolean;
};

async function openPortal(flow: PortalFlow = "default") {
  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flow }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Unable to open Stripe");
  }
  // Keep the player running — Stripe opens in a new tab.
  openExternalUrl(data.url);
}

export default function BillingMembershipPanel({
  email,
  stripeStatus,
  hasStripeCustomer,
  isPremium,
  planName,
  priceLabel,
  currentPeriodEnd,
  paymentMethodLabel,
  cancelAtPeriodEnd,
}: Props) {
  const isPastDue = stripeStatus === "past_due";
  const [busy, setBusy] = useState<PortalFlow | "checkout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function runPortal(flow: PortalFlow) {
    setBusy(flow);
    setError(null);
    try {
      await openPortal(flow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function runCheckout() {
    setBusy("checkout");
    setError(null);
    try {
      await fetch("/api/stripe/sync", { method: "POST", credentials: "include" });
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Unable to start checkout");
      }
      openExternalUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = isPremium
    ? cancelAtPeriodEnd
      ? "Cancels at period end"
      : "Active"
    : isPastDue
      ? "Past due"
      : "No active plan";

  return (
    <div className="space-y-8">
      <SyncSubscriptionBanner
        currentStatus={stripeStatus}
        hasStripeCustomer={hasStripeCustomer}
      />

      <section
        className="animate-fade-up space-y-5"
        style={{ animationDelay: "80ms" }}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            Current subscription
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                {planName}
              </h3>
              {priceLabel && (
                <p className="mt-1 text-sm text-white/60">{priceLabel}</p>
              )}
            </div>
            <span
              className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
                isPremium
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : isPastDue
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                    : "border-white/15 bg-white/5 text-white/50"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {currentPeriodEnd && (
            <div>
              <dt className="text-white/40">
                {cancelAtPeriodEnd ? "Access until" : "Renewal"}
              </dt>
              <dd className="mt-1 text-white/85">
                {cancelAtPeriodEnd
                  ? currentPeriodEnd
                  : `Renews on ${currentPeriodEnd}`}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-white/40">Billing email</dt>
            <dd className="mt-1 break-all text-white/85">{email}</dd>
          </div>
          {paymentMethodLabel && (
            <div>
              <dt className="text-white/40">Payment method</dt>
              <dd className="mt-1 text-white/85">{paymentMethodLabel}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
          {isPremium || isPastDue ? (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runPortal("payment_method")}
                className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
              >
                {busy === "payment_method"
                  ? "Opening Stripe…"
                  : "Update payment method"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runPortal("default")}
                className="rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-medium text-white/75 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-60"
              >
                {busy === "default" ? "Opening Stripe…" : "Open Stripe portal"}
              </button>
              {isPremium && !cancelAtPeriodEnd && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setCancelOpen(true)}
                  className="rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-medium text-white/60 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-fuchsia-200 disabled:opacity-60"
                >
                  Cancel membership
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runCheckout()}
                className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
              >
                {busy === "checkout" ? "Opening checkout…" : "Start membership"}
              </button>
              <Link
                href="/pricing"
                className="rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-center text-sm font-medium text-white/70 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100"
              >
                View pricing
              </Link>
            </>
          )}
        </div>
        {error && <p className="text-xs text-fuchsia-300">{error}</p>}
      </section>

      <section
        className="animate-fade-up border-t border-white/10 pt-5"
        style={{ animationDelay: "140ms" }}
      >
        <Link
          href="/dashboard/profile"
          className="text-sm text-cyan-300/80 underline-offset-2 transition hover:text-cyan-200 hover:underline"
        >
          ← Back to Listener Lounge
        </Link>
      </section>

      {cancelOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="billing-cancel-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0614] p-6 shadow-[0_0_40px_rgba(217,70,239,0.2)]">
            <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/70">
              Before you go
            </p>
            <h3
              id="billing-cancel-title"
              className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white"
            >
              Cancel Premium?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              You&apos;ll keep access until the end of the current billing
              period. Final confirmation happens in Stripe&apos;s secure cancel
              flow — the music keeps playing on this tab.
            </p>
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
                onClick={() => void runPortal("cancel")}
                className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                {busy === "cancel"
                  ? "Opening cancel flow…"
                  : "Continue to cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
