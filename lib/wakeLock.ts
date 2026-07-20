/**
 * Screen Wake Lock — keeps the OS from treating the tab as idle disposable
 * memory while RithmGen is actively streaming (car-radio style session).
 */

let wakeLock: WakeLockSentinel | null = null;
let wantWakeLock = false;

async function acquire(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.wakeLock?.request) return;
  if (document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
      if (wantWakeLock) void acquire();
    });
  } catch {
    wakeLock = null;
  }
}

/** Call when Start Radio / Play begins a live session. */
export function requestBroadcastWakeLock(): void {
  wantWakeLock = true;
  void acquire();
}

/** Call when the user fully stops the broadcast. */
export function releaseBroadcastWakeLock(): void {
  wantWakeLock = false;
  try {
    void wakeLock?.release();
  } catch {
    // ignore
  }
  wakeLock = null;
}

/** Re-assert after the tab returns to the foreground. */
export function reassertBroadcastWakeLock(): void {
  if (!wantWakeLock) return;
  void acquire();
}
