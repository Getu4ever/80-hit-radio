import type { Track } from "@/data/tracks";

type MediaSessionHandlers = {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

function hasMediaSession(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Keep OS Media Session metadata live so background audio stays prioritized. */
export function syncMediaSessionMetadata(track: Track | null): void {
  if (!hasMediaSession() || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "RithmGen 80s Hit Radio",
      artwork: track.imageUrl
        ? [
            { src: track.imageUrl, sizes: "512x512", type: "image/jpeg" },
            { src: track.imageUrl, sizes: "256x256", type: "image/jpeg" },
          ]
        : [],
    });
  } catch {
    // MediaMetadata unsupported / blocked.
  }
}

export function syncMediaSessionPlaybackState(
  state: MediaSessionPlaybackState,
): void {
  if (!hasMediaSession()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // ignore
  }
}

export function syncMediaSessionPosition(state: {
  duration: number;
  position: number;
  playbackRate?: number;
}): void {
  if (!hasMediaSession()) return;
  if (!(state.duration > 0) || !Number.isFinite(state.position)) return;
  try {
    navigator.mediaSession.setPositionState?.({
      duration: state.duration,
      position: Math.min(Math.max(0, state.position), state.duration),
      playbackRate: state.playbackRate ?? 1,
    });
  } catch {
    // Some browsers reject position updates mid-swap.
  }
}

/** Bind transport actions once; keep handlers via refs on the caller side. */
export function bindMediaSessionActions(handlers: MediaSessionHandlers): () => void {
  if (!hasMediaSession()) return () => {};

  const set = (action: MediaSessionAction, fn?: () => void) => {
    try {
      if (fn) {
        navigator.mediaSession.setActionHandler(action, () => fn());
      } else {
        navigator.mediaSession.setActionHandler(action, null);
      }
    } catch {
      // Action not supported on this platform.
    }
  };

  set("play", handlers.onPlay);
  set("pause", handlers.onPause);
  set("nexttrack", handlers.onNext);
  set("previoustrack", handlers.onPrevious);
  set("stop", handlers.onPause);

  return () => {
    set("play");
    set("pause");
    set("nexttrack");
    set("previoustrack");
    set("stop");
  };
}
