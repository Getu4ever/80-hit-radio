/**
 * Imperative bridge so transport buttons can call HTMLMediaElement.play()
 * inside the same user-gesture call stack (required by mobile Safari/Chrome).
 *
 * React state → useEffect → play() loses the gesture token and is rejected.
 * For cold track swaps (src not yet on a slot), we keep a short gesture window
 * and retry play once the engine finishes injecting the new source.
 */

type PlayNowFn = () => boolean;

let playNowHandler: PlayNowFn | null = null;
/** Epoch ms — retries remain valid briefly after a tap (iOS gesture grace). */
let gestureUnlockUntil = 0;
/** True until a successful playCurrentInGesture or the unlock window expires. */
let pendingPlay = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let unlockMediaEl: HTMLAudioElement | null = null;

const GESTURE_WINDOW_MS = 4_000;
const RETRY_INTERVAL_MS = 50;
const MAX_RETRIES = 40;

export function registerMediaPlayNow(fn: PlayNowFn | null): void {
  playNowHandler = fn;
}

function clearRetryTimer() {
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * Best-effort AudioContext / media unlock on the first touch so subsequent
 * play() calls after a short React render are less likely to be blocked.
 */
export function unlockMediaGesture(): void {
  gestureUnlockUntil = Date.now() + GESTURE_WINDOW_MS;
  if (typeof window === "undefined") return;

  try {
    if (!unlockMediaEl) {
      unlockMediaEl = new Audio();
      unlockMediaEl.preload = "auto";
      unlockMediaEl.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    }
    unlockMediaEl.muted = true;
    unlockMediaEl.volume = 0;
    void unlockMediaEl.play().then(() => {
      unlockMediaEl?.pause();
    }).catch(() => {
      // Autoplay policies may still reject — real play stays on the YouTube slot.
    });
  } catch {
    // Ignore unlock failures; engine path still attempts play().
  }
}

function schedulePendingPlayRetries(): void {
  clearRetryTimer();
  let attempts = 0;

  const tick = () => {
    if (!pendingPlay || Date.now() > gestureUnlockUntil) {
      pendingPlay = false;
      clearRetryTimer();
      return;
    }
    try {
      if (playNowHandler?.()) {
        pendingPlay = false;
        clearRetryTimer();
        return;
      }
    } catch {
      // keep retrying within the gesture window
    }
    attempts += 1;
    if (attempts >= MAX_RETRIES) {
      pendingPlay = false;
      clearRetryTimer();
      return;
    }
    retryTimer = setTimeout(tick, RETRY_INTERVAL_MS);
  };

  retryTimer = setTimeout(tick, RETRY_INTERVAL_MS);
}

/** Call synchronously from a click/tap handler after setting isPlaying true. */
export function mediaPlayNow(): boolean {
  unlockMediaGesture();
  pendingPlay = true;
  try {
    const ok = playNowHandler?.() ?? false;
    if (ok) {
      pendingPlay = false;
      clearRetryTimer();
      return true;
    }
    schedulePendingPlayRetries();
    return false;
  } catch {
    schedulePendingPlayRetries();
    return false;
  }
}

/**
 * Called by AudioEngine after a cold src injection so a pending tap can
 * still promote/unmute within the gesture unlock window.
 */
export function flushPendingMediaPlay(): boolean {
  if (!pendingPlay) return false;
  if (Date.now() > gestureUnlockUntil) {
    pendingPlay = false;
    clearRetryTimer();
    return false;
  }
  try {
    const ok = playNowHandler?.() ?? false;
    if (ok) {
      pendingPlay = false;
      clearRetryTimer();
    }
    return ok;
  } catch {
    return false;
  }
}
