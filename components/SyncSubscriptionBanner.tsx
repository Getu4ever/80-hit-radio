"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StripeSubscriptionStatus } from "@/types/database.types";

type Phase = "hidden" | "syncing" | "unlocked" | "nudge" | "error";

function isAmbiguousStatus(status: StripeSubscriptionStatus): boolean {
  return status === "trialing" || status === "past_due";
}

/**
 * Reconciles membership after checkout lag.
 * Stays silent for ordinary free-trial / no-plan visits; only surfaces UI
 * when unlocking, when status is ambiguous, or when the listener asks.
 */
export default function SyncSubscriptionBanner({
  currentStatus,
  hasStripeCustomer = false,
}: {
  currentStatus: StripeSubscriptionStatus;
  hasStripeCustomer?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [message, setMessage] = useState("");

  const mayNeedSync =
    currentStatus !== "active" &&
    (hasStripeCustomer || isAmbiguousStatus(currentStatus));

  async function sync(mode: "silent" | "manual") {
    if (mode === "manual" || isAmbiguousStatus(currentStatus)) {
      setPhase("syncing");
      setMessage("Updating your membership…");
    }

    try {
      const res = await fetch("/api/stripe/sync", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        user?: { stripeSubscriptionStatus?: StripeSubscriptionStatus };
        error?: string;
      };

      if (!res.ok) {
        if (mode === "manual" || isAmbiguousStatus(currentStatus)) {
          setPhase("error");
          setMessage(
            "Couldn't update membership right now. Try again in a moment.",
          );
        }
        return;
      }

      const next = data.user?.stripeSubscriptionStatus ?? currentStatus;

      if (next === "active") {
        setPhase("unlocked");
        setMessage("You're a member — welcome back to the lounge.");
        router.refresh();
        return;
      }

      if (mode === "manual") {
        setPhase("nudge");
        setMessage(
          next === "past_due"
            ? "Your membership is past due. Update billing to keep listening."
            : "Membership isn't active yet. If you just subscribed, try again in a moment.",
        );
        router.refresh();
        return;
      }

      if (next === "past_due" || currentStatus === "past_due") {
        setPhase("nudge");
        setMessage(
          "Your membership is past due. Update billing to keep listening.",
        );
        router.refresh();
        return;
      }

      if (next === "trialing" || currentStatus === "trialing") {
        setPhase("nudge");
        setMessage(
          "Free trial on file. Just subscribed? Check membership in a moment.",
        );
        router.refresh();
        return;
      }

      setPhase("hidden");
      router.refresh();
    } catch {
      if (mode === "manual" || isAmbiguousStatus(currentStatus)) {
        setPhase("error");
        setMessage("Couldn't reach billing just now.");
      }
    }
  }

  useEffect(() => {
    if (currentStatus === "active") return;
    if (!mayNeedSync) return;
    void sync("silent");
    // Intentionally once on mount when sync may help.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (currentStatus === "active" && phase === "hidden") return null;
  if (phase === "hidden") return null;

  const showCheck =
    phase !== "syncing" &&
    phase !== "unlocked" &&
    currentStatus !== "active";

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3">
      <p className="text-sm text-cyan-100">{message}</p>
      {showCheck && (
        <button
          type="button"
          onClick={() => void sync("manual")}
          className="text-xs font-medium text-cyan-200/80 underline-offset-2 transition hover:text-cyan-100 hover:underline"
        >
          Check membership
        </button>
      )}
    </div>
  );
}
