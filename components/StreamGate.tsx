"use client";

import { useEffect } from "react";
import AudioEngine from "@/components/AudioEngine";
import PaywallOverlay from "@/components/PaywallOverlay";
import { useAudioStore } from "@/store/useAudioStore";
import {
  useStreamAccessStore,
  type StreamDenialReason,
} from "@/store/useStreamAccessStore";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

type CheckStatusResponse = {
  eligible?: boolean;
  message?: string;
  reason?: StreamDenialReason;
  trialDaysRemaining?: number;
};

async function applyCheckResult(
  setAccess: ReturnType<typeof useStreamAccessStore.getState>["setAccess"],
) {
  const res = await fetch("/api/stream/check-status", {
    credentials: "include",
  });
  const data = (await res.json()) as CheckStatusResponse;

  if (res.status === 401 || res.status === 403 || data.eligible === false) {
    if (useAudioStore.getState().isPlaying) {
      useAudioStore.setState({ isPlaying: false });
    }

    const reason: StreamDenialReason =
      data.reason ??
      (res.status === 401 ? "unauthenticated" : "trial_expired");

    setAccess({
      allowed: false,
      reason,
      message:
        data.message ??
        (reason === "unauthenticated"
          ? "Sign in to start your free month and stream classic 80s hits."
          : "Your free month has expired. Subscribe now to keep rocking the 80s!"),
      trialDaysRemaining: 0,
    });
    return;
  }

  setAccess({
    allowed: true,
    reason: "ok",
    message: null,
    trialDaysRemaining: data.trialDaysRemaining ?? null,
  });
}

/**
 * Checks stream eligibility on load AND whenever auth state changes
 * (email confirm / sign-in), so the paywall unlocks without a hard refresh.
 */
export default function StreamGate() {
  const setAccess = useStreamAccessStore((s) => s.setAccess);
  const allowed = useStreamAccessStore((s) => s.allowed);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        if (cancelled) return;
        await applyCheckResult(setAccess);
      } catch {
        if (!cancelled) {
          if (useAudioStore.getState().isPlaying) {
            useAudioStore.setState({ isPlaying: false });
          }
          setAccess({
            allowed: false,
            reason: "error",
            message:
              "Unable to verify your subscription. Please refresh and try again.",
          });
        }
      }
    }

    void checkStatus();

    if (!isSupabaseConfigured()) {
      return () => {
        cancelled = true;
      };
    }

    const supabase = createClient();

    // Recover session from URL hash after email confirmation redirects.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !cancelled) {
        void checkStatus();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        void checkStatus();
      }
      if (event === "SIGNED_OUT") {
        void checkStatus();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setAccess]);

  return (
    <>
      <AudioEngine streamingAllowed={allowed} />
      <PaywallOverlay />
    </>
  );
}
