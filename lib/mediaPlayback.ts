/**
 * Imperative bridge so transport buttons can call HTMLMediaElement.play()
 * inside the same user-gesture call stack (required by mobile Safari/Chrome).
 *
 * React state → useEffect → play() loses the gesture token and is rejected.
 */

type PlayNowFn = () => boolean;

let playNowHandler: PlayNowFn | null = null;

export function registerMediaPlayNow(fn: PlayNowFn | null): void {
  playNowHandler = fn;
}

/** Call synchronously from a click/tap handler after setting isPlaying true. */
export function mediaPlayNow(): boolean {
  try {
    return playNowHandler?.() ?? false;
  } catch {
    return false;
  }
}
