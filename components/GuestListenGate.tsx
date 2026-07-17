"use client";

import { useEffect, useRef } from "react";
import {
  addGuestListenSeconds,
  getGuestLimitMessage,
  GUEST_LISTEN_LIMIT_SECONDS,
  hasGuestReachedListenLimit,
} from "@/lib/guestListenLimit";
import { useUserSessionStore } from "@/hooks/useUserSession";
import { useAudioStore } from "@/store/useAudioStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

const TICK_MS = 1000;

function enforceGuestLimit() {
  if (useAudioStore.getState().isPlaying) {
    useAudioStore.setState({ isPlaying: false });
  }
  useStreamAccessStore.getState().setAccess({
    allowed: false,
    reason: "guest_limit",
    message: getGuestLimitMessage(),
    trialDaysRemaining: 0,
  });
}

/**
 * Tracks cumulative guest playback in localStorage and locks the stream
 * the moment an anonymous listener reaches the 1-hour free budget.
 */
export default function GuestListenGate() {
  const user = useUserSessionStore((s) => s.user);
  const hydrated = useUserSessionStore((s) => s.hydrated);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const allowed = useStreamAccessStore((s) => s.allowed);

  const lastTickRef = useRef<number | null>(null);

  // On hydrate / sign-out: lock immediately if the free hour is already used.
  useEffect(() => {
    if (!hydrated || user) return;
    if (hasGuestReachedListenLimit()) {
      enforceGuestLimit();
    }
  }, [hydrated, user]);

  // If API re-allows a guest who already hit the limit, re-lock.
  useEffect(() => {
    if (!hydrated || user) return;
    if (allowed && hasGuestReachedListenLimit()) {
      enforceGuestLimit();
    }
  }, [hydrated, user, allowed]);

  // Accumulate listen time while a guest is actively playing.
  useEffect(() => {
    if (!hydrated || user || !isPlaying || !allowed) {
      lastTickRef.current = null;
      return;
    }

    if (hasGuestReachedListenLimit()) {
      enforceGuestLimit();
      return;
    }

    lastTickRef.current = Date.now();

    const id = window.setInterval(() => {
      if (useUserSessionStore.getState().user) return;
      if (!useAudioStore.getState().isPlaying) return;

      const now = Date.now();
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const deltaSec = Math.max(0, (now - last) / 1000);
      const total = addGuestListenSeconds(deltaSec);

      if (total >= GUEST_LISTEN_LIMIT_SECONDS) {
        enforceGuestLimit();
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(id);
      if (lastTickRef.current != null && !useUserSessionStore.getState().user) {
        const deltaSec = Math.max(0, (Date.now() - lastTickRef.current) / 1000);
        const total = addGuestListenSeconds(deltaSec);
        lastTickRef.current = null;
        if (total >= GUEST_LISTEN_LIMIT_SECONDS) {
          enforceGuestLimit();
        }
      }
    };
  }, [hydrated, user, isPlaying, allowed]);

  return null;
}
