"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type SyncState = "syncing" | "premium" | "pending" | "error";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [state, setState] = useState<SyncState>("syncing");
  const [message, setMessage] = useState("Confirming your payment with Stripe…");

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch("/api/stripe/sync", {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json()) as {
          user?: { stripeSubscriptionStatus?: string };
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok) {
          setState("error");
          setMessage(
            data.error ??
              "We received your payment, but could not refresh your account yet.",
          );
          return;
        }

        if (data.user?.stripeSubscriptionStatus === "active") {
          setState("premium");
          setMessage("You're Premium. Unlimited 80s hits are unlocked.");
          return;
        }

        setState("pending");
        setMessage(
          "Payment received. Premium activation can take a few seconds — tap refresh if needed.",
        );
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage(
            "Payment may have succeeded. Sign in and open your profile to refresh.",
          );
        }
      }
    }

    void sync();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07040f] px-6 text-white">
      <div
        className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-fuchsia-600/25 blur-[110px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-16 h-80 w-80 rounded-full bg-cyan-500/20 blur-[110px]"
        aria-hidden
      />

      <div className="relative w-full max-w-lg rounded-3xl border border-cyan-400/25 bg-[#0a0614]/90 p-8 text-center shadow-[0_0_50px_rgba(34,211,238,0.15)] sm:p-10">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-400/80">
          {state === "premium" ? "Welcome to Premium" : "Checkout"}
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300 sm:text-4xl">
          {state === "premium"
            ? "Thank you for subscribing"
            : state === "syncing"
              ? "Almost there…"
              : "Thank you"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/55 sm:text-base">
          {message}
        </p>

        {state === "premium" && (
          <p className="mt-3 text-sm text-cyan-300/90">
            $9.99/month · Cancel anytime from your profile
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(217,70,239,0.4)] transition hover:brightness-110"
          >
            Start listening
          </Link>
          <Link
            href="/dashboard/profile"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            View account
          </Link>
        </div>

        {(state === "pending" || state === "error") && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-cyan-300/70 underline-offset-2 hover:underline"
          >
            Refresh status
          </button>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#07040f] text-white/60">
          Confirming payment…
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
