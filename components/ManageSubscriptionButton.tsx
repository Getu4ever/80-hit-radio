"use client";

import { useState } from "react";
import Link from "next/link";
import { useUserSession } from "@/hooks/useUserSession";
import { openExternalUrl } from "@/lib/openExternalUrl";

interface ManageSubscriptionButtonProps {
  label?: string;
}

export default function ManageSubscriptionButton({
  label = "Manage Subscription",
}: ManageSubscriptionButtonProps) {
  const { user } = useUserSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = user?.stripeSubscriptionStatus === "active";

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/stripe/sync", {
        method: "POST",
        credentials: "include",
      });

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Unable to open Stripe");
        return;
      }
      openExternalUrl(data.url);
    } catch {
      setError("Network error talking to Stripe");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {isActive ? (
        <button
          type="button"
          onClick={() => openExternalUrl("/dashboard/billing")}
          className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110"
        >
          Manage billing
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={loading}
          className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Working…" : label}
        </button>
      )}
      {error && <p className="text-xs text-fuchsia-300/90">{error}</p>}
      {!isActive && (
        <Link
          href="/pricing"
          className="text-center text-xs text-cyan-300/70 underline-offset-2 hover:underline"
        >
          View pricing plans
        </Link>
      )}
    </div>
  );
}
