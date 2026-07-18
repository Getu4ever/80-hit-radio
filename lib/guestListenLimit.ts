/**
 * Guest free listen budget — client UX cache only.
 * Server (IP hash + device cookie via /api/guest/listen + check-status) is source of truth.
 * Clearing localStorage / private windows must not unlock another hour.
 */

export const GUEST_LISTEN_LIMIT_SECONDS = 60 * 60; // exactly 1 hour
export const GUEST_LISTEN_STORAGE_KEY = "rithmgen-guest-listen-seconds";

const GUEST_LIMIT_MESSAGE =
  "You've used your 1-hour guest listen. Create a free account to unlock a 14-day Premium trial — all genres, unlimited skips, and no ads.";

export function getGuestLimitMessage(): string {
  return GUEST_LIMIT_MESSAGE;
}

function clampSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), GUEST_LISTEN_LIMIT_SECONDS * 10);
}

export function readGuestListenSeconds(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(GUEST_LISTEN_STORAGE_KEY);
    if (!raw) return 0;
    return clampSeconds(Number(raw));
  } catch {
    return 0;
  }
}

/** Sync UX cache from server totals (never treat as authoritative alone). */
export function writeGuestListenSeconds(seconds: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GUEST_LISTEN_STORAGE_KEY,
      String(clampSeconds(seconds)),
    );
  } catch {
    // Private mode / quota — fail soft; server enforcement still applies.
  }
}

/**
 * Clears the local UX cache only. Does NOT reset server quota —
 * sign-out / sign-in must not grant another free hour on the same IP.
 */
export function clearGuestListenSeconds(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_LISTEN_STORAGE_KEY);
  } catch {
    // Private mode — ignore.
  }
}

/** Adds elapsed seconds to the local cache and returns the new cumulative total. */
export function addGuestListenSeconds(deltaSeconds: number): number {
  const next = clampSeconds(readGuestListenSeconds() + Math.max(0, deltaSeconds));
  writeGuestListenSeconds(next);
  return next;
}

export function hasGuestReachedListenLimit(
  seconds = readGuestListenSeconds(),
): boolean {
  return seconds >= GUEST_LISTEN_LIMIT_SECONDS;
}

type GuestListenSyncResponse = {
  exhausted?: boolean;
  secondsListened?: number;
  secondsRemaining?: number;
  message?: string;
};

/** Accrue listen time on the server; updates local cache from the response. */
export async function syncGuestListenDelta(
  deltaSeconds: number,
): Promise<GuestListenSyncResponse | null> {
  if (typeof window === "undefined") return null;
  const delta = Math.max(0, Math.floor(deltaSeconds));
  try {
    const res = await fetch("/api/guest/listen", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltaSeconds: delta }),
      keepalive: true,
    });
    const data = (await res.json()) as GuestListenSyncResponse;
    if (typeof data.secondsListened === "number") {
      writeGuestListenSeconds(data.secondsListened);
    }
    return data;
  } catch {
    return null;
  }
}
