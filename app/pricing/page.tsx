"use client";

import Link from "next/link";
import { useState } from "react";
import { useUserSession } from "@/hooks/useUserSession";

export default function PricingPage() {
  const { isLoggedIn } = useUserSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      if (!isLoggedIn) {
        window.location.href = "/auth/login?next=/pricing";
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { url?: string; error?: string };

      if (res.status === 401) {
        window.location.href = "/auth/login?next=/pricing";
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error ?? "Unable to start checkout");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Network error starting checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07040f] px-6 py-16 text-white">
      <div
        className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-fuchsia-600/25 blur-[110px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-16 h-80 w-80 rounded-full bg-cyan-500/20 blur-[110px]"
        aria-hidden
      />

      <p className="relative text-xs uppercase tracking-[0.4em] text-cyan-400/70">
        Premium membership
      </p>
      <h1 className="relative mt-3 max-w-xl text-center font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300 sm:text-5xl">
        Non-stop 80s. Zero interruptions.
      </h1>
      <p className="relative mt-4 max-w-md text-center text-sm text-white/50 sm:text-base">
        One simple plan. Unlimited classic hits, cancel anytime.
      </p>

      <div className="relative mt-10 w-full max-w-md rounded-3xl border border-fuchsia-500/30 bg-white/[0.04] p-8 shadow-[0_0_50px_rgba(217,70,239,0.18)]">
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-widest text-fuchsia-300/80">
            Premium
          </p>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
            Most popular
          </span>
        </div>
        <p className="mt-4 font-[family-name:var(--font-display)] text-5xl font-bold">
          $9.99
          <span className="text-base font-normal text-white/40"> / month</span>
        </p>
        <ul className="mt-6 space-y-3 text-sm text-white/65">
          <li className="flex gap-2">
            <span className="text-cyan-400">✓</span>
            Unlimited classic 80s streaming
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400">✓</span>
            Continuous radio — no ads in the player
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400">✓</span>
            Cancel anytime from your account
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400">✓</span>
            Future stations included as we expand
          </li>
        </ul>
        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="mt-8 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Opening secure checkout…" : "Subscribe — $9.99/mo"}
        </button>
        {error && (
          <p className="mt-3 text-center text-xs text-fuchsia-300">{error}</p>
        )}
        <p className="mt-4 text-center text-[11px] text-white/35">
          Secured by Stripe · Test or live mode depending on your keys
        </p>
      </div>

      <Link
        href="/"
        className="relative mt-10 text-sm text-white/40 transition hover:text-cyan-300"
      >
        Back to Radio
      </Link>
    </div>
  );
}
