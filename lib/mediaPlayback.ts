/**
 * Imperative bridge so transport buttons can call HTMLMediaElement.play()
 * inside the same user-gesture call stack (required by mobile Safari/Chrome).
 *
 * Also owns the Silent Audio Keep-Alive Loop: a gesture-started, continuously
 * looping near-silent media stream that keeps the tab's autoplay / media
 * session alive across track handoffs in background tabs.
 */

type PlayNowFn = () => boolean;
type ResumeFn = () => void;

type MediaLike = {
  muted?: boolean;
  paused?: boolean;
  play?: () => Promise<void> | void;
  api?: {
    playVideo?: () => void;
    unMute?: () => void;
    setVolume?: (n: number) => void;
  };
};

let playNowHandler: PlayNowFn | null = null;
let resumeHandler: ResumeFn | null = null;
/** Epoch ms — retries remain valid briefly after a tap (iOS gesture grace). */
let gestureUnlockUntil = 0;
/** True until a successful playCurrentInGesture or the unlock window expires. */
let pendingPlay = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** ~0.1s of silence (PCM WAV) — loops forever after a user gesture. */
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

let keepAliveAudio: HTMLAudioElement | null = null;
let keepAliveCtx: AudioContext | null = null;
let keepAliveSource: AudioBufferSourceNode | null = null;
let keepAliveActive = false;
let keepAliveWatchdog: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;

const GESTURE_WINDOW_MS = 6_000;
const RETRY_INTERVAL_MS = 32;
const MAX_RETRIES = 60;
const KEEP_ALIVE_WATCHDOG_MS = 1_500;

function onVisibilityPulse() {
  if (!keepAliveActive) return;
  pulseKeepAlive();
}

function bindVisibilityWatch() {
  if (typeof document === "undefined" || visibilityBound) return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", onVisibilityPulse);
  window.addEventListener("pageshow", onVisibilityPulse);
  window.addEventListener("focus", onVisibilityPulse);
  // Page Lifecycle API — WebViews fire these around suspend/resume.
  document.addEventListener("freeze", onVisibilityPulse);
  document.addEventListener("resume", onVisibilityPulse);
}

export function registerMediaPlayNow(fn: PlayNowFn | null): void {
  playNowHandler = fn;
}

/** AudioEngine registers full live+standby reassert for Capacitor / visibility. */
export function registerBroadcastResume(fn: ResumeFn | null): void {
  resumeHandler = fn;
}

/**
 * Re-kick keep-alive + registered players after app resume / foreground.
 * Unlike flushPendingMediaPlay, this does not require a recent tap token.
 */
export function resumeBroadcastPlayback(): void {
  if (typeof window === "undefined") return;
  startSilentKeepAlive();
  try {
    resumeHandler?.();
  } catch {
    // Engine may be unmounted mid-resume.
  }
}

function clearRetryTimer() {
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function ensureKeepAliveAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (keepAliveAudio) return keepAliveAudio;
  try {
    const el = new Audio();
    el.preload = "auto";
    el.loop = true;
    el.muted = true;
    el.volume = 0;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.src = SILENT_WAV_DATA_URI;
    // Park off-DOM — never unmount while the radio session is alive.
    keepAliveAudio = el;
    return el;
  } catch {
    return null;
  }
}

function ensureKeepAliveContext(): void {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    if (!keepAliveCtx || keepAliveCtx.state === "closed") {
      keepAliveCtx = new AC();
      keepAliveSource = null;
    }

    if (keepAliveCtx.state === "suspended") {
      void keepAliveCtx.resume().catch(() => {});
    }

    if (keepAliveSource) return;

    // Generative ~0.1s silent buffer, looped — parallel to the HTMLAudio keep-alive.
    const frames = Math.max(1, Math.floor(keepAliveCtx.sampleRate * 0.1));
    const buffer = keepAliveCtx.createBuffer(1, frames, keepAliveCtx.sampleRate);
    // Leave channel data at 0 (true silence). Gain stays tiny so the graph
    // remains "active" without audible output.
    const source = keepAliveCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = keepAliveCtx.createGain();
    gain.gain.value = 0.00001;
    source.connect(gain);
    gain.connect(keepAliveCtx.destination);
    source.start(0);
    keepAliveSource = source;
  } catch {
    // HTMLAudio keep-alive is enough on browsers that block AudioContext.
  }
}

function pulseKeepAlive(): void {
  if (!keepAliveActive) return;
  const el = keepAliveAudio;
  if (el) {
    try {
      el.muted = true;
      el.volume = 0;
      el.loop = true;
      if (el.paused) {
        void el.play().catch(() => {
          // Watchdog will retry; force-play paths also re-assert.
        });
      }
    } catch {
      // Ignore — next watchdog tick retries.
    }
  }
  if (keepAliveCtx?.state === "suspended") {
    void keepAliveCtx.resume().catch(() => {});
  }
}

/**
 * Start (or re-assert) the continuous silent keep-alive.
 * Must be called from a user gesture (Start Radio / Play) so autoplay grants
 * the media session; looping forever prevents re-evaluation between tracks.
 */
export function startSilentKeepAlive(): void {
  if (typeof window === "undefined") return;
  keepAliveActive = true;
  gestureUnlockUntil = Math.max(
    gestureUnlockUntil,
    Date.now() + GESTURE_WINDOW_MS,
  );

  const el = ensureKeepAliveAudio();
  if (el) {
    try {
      el.muted = true;
      el.volume = 0;
      el.loop = true;
      if (!el.src) el.src = SILENT_WAV_DATA_URI;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === "function") {
        void playPromise.catch(() => {
          // Retry once immediately — common after tab return.
          window.setTimeout(() => {
            if (!keepAliveActive) return;
            void el.play().catch(() => {});
          }, 0);
        });
      }
    } catch {
      // AudioContext path below still runs.
    }
  }

  ensureKeepAliveContext();
  bindVisibilityWatch();

  if (keepAliveWatchdog == null) {
    keepAliveWatchdog = setInterval(pulseKeepAlive, KEEP_ALIVE_WATCHDOG_MS);
  }
}

/** Tear down keep-alive when the user fully stops the radio session. */
export function stopSilentKeepAlive(): void {
  keepAliveActive = false;
  if (keepAliveWatchdog != null) {
    clearInterval(keepAliveWatchdog);
    keepAliveWatchdog = null;
  }
  try {
    keepAliveAudio?.pause();
  } catch {
    // ignore
  }
  try {
    keepAliveSource?.stop();
  } catch {
    // ignore
  }
  keepAliveSource = null;
  if (keepAliveCtx && keepAliveCtx.state !== "closed") {
    void keepAliveCtx.close().catch(() => {});
  }
  keepAliveCtx = null;
}

export function isSilentKeepAliveActive(): boolean {
  return keepAliveActive;
}

/**
 * Best-effort AudioContext / media unlock on the first touch so subsequent
 * play() calls after a short React render are less likely to be blocked.
 * Starts the continuous silent keep-alive (never pause-after-play).
 */
export function unlockMediaGesture(): void {
  gestureUnlockUntil = Date.now() + GESTURE_WINDOW_MS;
  startSilentKeepAlive();
}

/**
 * Force-play a media element (YouTube slot wrapper). On NotAllowedError /
 * autoplay rejection, instantly re-assert keep-alive and retry play + YT API.
 * Pass preferMuted for standby warm plays — never unmute a muted slot on retry.
 */
export function forcePlayMedia(
  media: unknown,
  opts?: { preferMuted?: boolean },
): boolean {
  if (!media || typeof media !== "object") return false;
  const el = media as MediaLike;
  const preferMuted = opts?.preferMuted === true || el.muted === true;
  startSilentKeepAlive();

  const attempt = (): boolean => {
    try {
      const playFn = el.play;
      if (typeof playFn === "function") {
        const p = playFn.call(el);
        if (p && typeof (p as Promise<void>).then === "function") {
          void (p as Promise<void>).catch((err: unknown) => {
            const name =
              err && typeof err === "object" && "name" in err
                ? String((err as { name: string }).name)
                : "";
            const message =
              err && typeof err === "object" && "message" in err
                ? String((err as { message: string }).message)
                : String(err ?? "");
            const blocked =
              name === "NotAllowedError" ||
              /not allowed|user didn't interact|autoplay/i.test(message);
            if (blocked || el.paused !== false) {
              // Fallback: re-assert keep-alive then native play + iframe API.
              startSilentKeepAlive();
              try {
                if (typeof el.muted === "boolean") {
                  // Standby must stay muted; unmuting breaks dual-slot radio.
                  el.muted = preferMuted;
                }
              } catch {
                // ignore
              }
              try {
                void el.play?.()?.catch?.(() => {});
              } catch {
                // ignore
              }
              try {
                el.api?.playVideo?.();
              } catch {
                // Optional iframe API path.
              }
            }
          });
        }
      }
      try {
        el.api?.playVideo?.();
      } catch {
        // Optional iframe API path.
      }
      return el.paused === false;
    } catch {
      try {
        el.api?.playVideo?.();
      } catch {
        // ignore
      }
      return el.paused === false;
    }
  };

  return attempt();
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
      startSilentKeepAlive();
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
    startSilentKeepAlive();
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

type PersistentAdvanceFn = (reason: string) => void;
let persistentAdvanceHandler: PersistentAdvanceFn | null = null;

/** AudioEngine registers the single-node advance path here. */
export function registerPersistentAdvance(
  fn: PersistentAdvanceFn | null,
): void {
  persistentAdvanceHandler = fn;
}

/**
 * UI / Media Session next — injects on the permanent player when mounted.
 * Returns false if the engine isn't ready (caller should fall back to store).
 */
export function requestPersistentAdvance(reason = "ui"): boolean {
  if (!persistentAdvanceHandler) return false;
  persistentAdvanceHandler(reason);
  return true;
}
