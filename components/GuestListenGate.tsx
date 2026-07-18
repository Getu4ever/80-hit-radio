"use client";

import { useEffect, useRef } from "react";
import {
  addGuestListenSeconds,
  getGuestLimitMessage,
  GUEST_LISTEN_LIMIT_SECONDS,
  hasGuestReachedListenLimit,
  syncGuestListenDelta,
  writeGuestListenSeconds,
} from "@/lib/guestListenLimit";
import { useUserSessionStore } from "@/hooks/useUserSession";
import { useAudioStore } from "@/store/useAudioStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

const TICK_MS = 1000;
const SERVER_SYNC_MS = 10_000;

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
 * Tracks guest playback: localStorage is a UX cache; server IP/device quota
 * is the source of truth (clearing storage / private windows cannot reset it).
 */
export default function GuestListenGate() {
  const user = useUserSessionStore((s) => s.user);
  const hydrated = useUserSessionStore((s) => s.hydrated);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const allowed = useStreamAccessStore((s) => s.allowed);

  const lastTickRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);

  // On hydrate: prefer server quota; fall back to local cache.
  useEffect(() => {
    if (!hydrated || user) return;

    let cancelled = false;

    async function syncFromServer() {
      try {
        const res = await fetch("/api/guest/listen", {
          credentials: "include",
        });
        const data = (await res.json()) as {
          exhausted?: boolean;
          secondsListened?: number;
        };
        if (cancelled) return;
        if (typeof data.secondsListened === "number") {
          writeGuestListenSeconds(data.secondsListened);
        }
        if (data.exhausted || hasGuestReachedListenLimit()) {
          enforceGuestLimit();
        }
      } catch {
        if (!cancelled && hasGuestReachedListenLimit()) {
          enforceGuestLimit();
        }
      }
    }

    void syncFromServer();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  // If API re-allows a guest who already hit the limit (cache), re-lock.
  useEffect(() => {
    if (!hydrated || user) return;
    if (allowed && hasGuestReachedListenLimit()) {
      enforceGuestLimit();
    }
  }, [hydrated, user, allowed]);

  // Accumulate listen time while a guest is actively playing; flush to server.
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

    const flushPending = () => {
      const pending = pendingDeltaRef.current;
      if (pending < 1) return;
      pendingDeltaRef.current = 0;
      void syncGuestListenDelta(pending).then((data) => {
        if (data?.exhausted) {
          enforceGuestLimit();
        }
      });
    };

    const tickId = window.setInterval(() => {
      if (useUserSessionStore.getState().user) return;
      if (!useAudioStore.getState().isPlaying) return;

      const now = Date.now();
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const deltaSec = Math.max(0, (now - last) / 1000);
      pendingDeltaRef.current += deltaSec;
      const total = addGuestListenSeconds(deltaSec);

      if (total >= GUEST_LISTEN_LIMIT_SECONDS) {
        flushPending();
        enforceGuestLimit();
      }
    }, TICK_MS);

    const syncId = window.setInterval(flushPending, SERVER_SYNC_MS);

    return () => {
      window.clearInterval(tickId);
      window.clearInterval(syncId);
      if (lastTickRef.current != null && !useUserSessionStore.getState().user) {
        const deltaSec = Math.max(0, (Date.now() - lastTickRef.current) / 1000);
        pendingDeltaRef.current += deltaSec;
        const total = addGuestListenSeconds(deltaSec);
        lastTickRef.current = null;
        flushPending();
        if (total >= GUEST_LISTEN_LIMIT_SECONDS) {
          enforceGuestLimit();
        }
      }
    };
  }, [hydrated, user, isPlaying, allowed]);

  return null;
}
