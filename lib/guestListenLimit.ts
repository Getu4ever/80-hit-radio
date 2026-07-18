/** Guest free listen budget — cumulative across sessions via localStorage. */

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

export function writeGuestListenSeconds(seconds: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GUEST_LISTEN_STORAGE_KEY,
      String(clampSeconds(seconds)),
    );
  } catch {
    // Private mode / quota — fail soft; in-memory enforcement still applies.
  }
}

/** Clears guest listen budget (fresh guest session after sign-out / sign-in). */
export function clearGuestListenSeconds(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_LISTEN_STORAGE_KEY);
  } catch {
    // Private mode — ignore.
  }
}

/** Adds elapsed seconds and returns the new cumulative total. */
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
