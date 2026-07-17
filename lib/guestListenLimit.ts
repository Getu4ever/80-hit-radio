/** Guest free listen budget — cumulative across sessions via localStorage. */

export const GUEST_LISTEN_LIMIT_SECONDS = 60 * 60; // exactly 1 hour
export const GUEST_LISTEN_STORAGE_KEY = "rithmgen-guest-listen-seconds";

const GUEST_LIMIT_MESSAGE =
  "Thank you for listening to RithmGen! You have reached the 1-hour free playback limit for guest listeners. To maintain an uninterrupted, premium listening experience and protect the high-fidelity broadcast stream, please take a brief moment to create a free account. By signing up today, you will instantly unlock a 14-day complimentary trial of RithmGen Premium, granting you full control over all 20 genres, unlimited track skipping, and zero background ads. Don't stop the rhythm—your music is just a click away.";

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
