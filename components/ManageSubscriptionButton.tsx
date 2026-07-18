"use client";

import { useState } from "react";
import Link from "next/link";
import { useUserSession } from "@/hooks/useUserSession";

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

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      if (!isActive) {
        await fetch("/api/stripe/sync", {
          method: "POST",
          credentials: "include",
        });
      }

      const endpoint = isActive
        ? "/api/stripe/portal"
        : "/api/stripe/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Unable to open Stripe");
        return;
      }
      // Keep the player running — open Stripe in a new tab.
      const opened = window.open(data.url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error talking to Stripe");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Working…" : isActive ? "Manage billing" : label}
      </button>
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
