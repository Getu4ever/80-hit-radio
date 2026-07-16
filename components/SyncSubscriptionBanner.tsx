"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Pulls live Stripe status into the profile after checkout. */
export default function SyncSubscriptionBanner({
  currentStatus,
}: {
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">(
    currentStatus === "active" ? "done" : "idle",
  );
  const [label, setLabel] = useState(
    currentStatus === "active"
      ? "Premium active"
      : "Payment not reflected yet?",
  );

  async function sync() {
    setStatus("syncing");
    setLabel("Syncing with Stripe…");
    try {
      const res = await fetch("/api/stripe/sync", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        user?: { stripeSubscriptionStatus?: string };
        error?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setLabel(data.error ?? "Sync failed");
        return;
      }
      setStatus("done");
      if (data.user?.stripeSubscriptionStatus === "active") {
        setLabel("Premium unlocked");
      } else {
        setLabel(
          `Stripe status: ${data.user?.stripeSubscriptionStatus ?? "unknown"}`,
        );
      }
      router.refresh();
    } catch {
      setStatus("error");
      setLabel("Could not reach Stripe sync");
    }
  }

  useEffect(() => {
    if (currentStatus !== "active") {
      void sync();
    }
    // Intentionally once on mount for unpaid profiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (currentStatus === "active" && status === "done") return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3">
      <p className="text-sm text-cyan-100">{label}</p>
      {status !== "syncing" && currentStatus !== "active" && (
        <button
          type="button"
          onClick={sync}
          className="rounded-lg border border-cyan-400/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/10"
        >
          Refresh payment
        </button>
      )}
    </div>
  );
}
