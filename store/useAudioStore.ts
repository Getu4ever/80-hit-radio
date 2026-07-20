import { create } from "zustand";
import { trackListenEvent } from "@/lib/analytics";
import {
  CLIENT_NEWS_INTERVAL_SEC,
  isClientNewsBulletinEnabled,
  shouldInjectNewsBulletin,
} from "@/lib/broadcastSchedule";
import { mediaPlayNow, stopSilentKeepAlive } from "@/lib/mediaPlayback";
import { releaseBroadcastWakeLock } from "@/lib/wakeLock";
import { useCatalogStore } from "@/store/useCatalogStore";
import type { Track } from "@/data/tracks";

function shuffleWithArtistGap(
  source: Track[],
  previousArtist?: string,
  failedIds?: Set<string>,
): Track[] {
  const pool = source.filter((t) => !failedIds?.has(t.id));
  const result: Track[] = [];
  let lastArtist = previousArtist;

  while (pool.length > 0) {
    const eligible = lastArtist
      ? pool.filter((t) => t.artist !== lastArtist)
      : pool;

    const pickFrom = eligible.length > 0 ? eligible : pool;
    const index = Math.floor(Math.random() * pickFrom.length);
    const track = pickFrom[index];
    const poolIndex = pool.findIndex((t) => t.id === track.id);

    pool.splice(poolIndex, 1);
    result.push(track);
    lastArtist = track.artist;
  }

  return result;
}

function pickRandomTrack(
  pool: Track[],
  previousArtist?: string,
  failedIds?: Set<string>,
): Track | null {
  const usable = failedIds
    ? pool.filter((t) => !failedIds.has(t.id))
    : pool;
  if (usable.length === 0) return null;
  const eligible = previousArtist
    ? usable.filter((t) => t.artist !== previousArtist)
    : usable;
  const pickFrom = eligible.length > 0 ? eligible : usable;
  return pickFrom[Math.floor(Math.random() * pickFrom.length)] ?? null;
}

interface AudioState {
  currentTrack: Track | null;
  upcomingTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  playbackHistory: Track[];
  failedTrackIds: Set<string>;
  /** Epoch ms — ignore YouTube teardown errors while swapping tracks. */
  ignorePlaybackErrorsUntil: number;
  volume: number;
  playedSeconds: number;
  duration: number;
  /** Monotonic id — AudioEngine applies `pendingSeekSeconds` when this changes. */
  seekRequestId: number;
  pendingSeekSeconds: number | null;
  /** AI-assisted HD stream optimizer (max tier + loudness normalize). */
  broadcastEnhance: boolean;
  streamQuality: string | null;

  /** Cumulative seconds of music playback (excludes news bulletins). */
  musicPlayedSeconds: number;
  lastBulletinAtMusicSeconds: number;
  newsBulletinIntervalSec: number;
  newsBulletinActive: boolean;

  playTrack: (track: Track) => void;
  togglePlay: () => void;
  nextTrack: (options?: {
    skipNewsCheck?: boolean;
    /** Engine already injected + played the next src — skip mediaPlayNow. */
    skipMediaPlay?: boolean;
  }) => void;
  previousTrack: () => void;
  setQueue: (tracks: Track[]) => void;
  /** Load current/upcoming without playing — warms YouTube before first Play. */
  cueRadio: (seed?: Track[]) => void;
  startRadio: (seed?: Track[]) => void;
  stopBroadcast: () => void;
  setVolume: (volume: number) => void;
  setPlayedSeconds: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  clearSeekRequest: () => void;
  ensureUpcoming: () => void;
  markTrackFailed: (trackId: string) => void;
  setBroadcastEnhance: (enabled: boolean) => void;
  setStreamQuality: (quality: string | null) => void;
  /**
   * DOM/React-paint-independent advance used by the background Worker
   * heartbeat when the tab is hidden and media events are frozen.
   */
  advanceFromBackground: (expectedTrackId?: string | null) => void;
  tickMusicPlayedSeconds: (deltaSec: number) => void;
  completeNewsBulletin: (options?: { skipped?: boolean }) => void;
}

const TRACK_SWAP_GRACE_MS = 1200;

export const useAudioStore = create<AudioState>((set, get) => ({
  currentTrack: null,
  upcomingTrack: null,
  isPlaying: false,
  queue: [],
  playbackHistory: [],
  failedTrackIds: new Set(),
  ignorePlaybackErrorsUntil: 0,
  volume: 0.8,
  playedSeconds: 0,
  duration: 0,
  seekRequestId: 0,
  pendingSeekSeconds: null,
  broadcastEnhance: true,
  streamQuality: null,
  musicPlayedSeconds: 0,
  lastBulletinAtMusicSeconds: 0,
  newsBulletinIntervalSec: CLIENT_NEWS_INTERVAL_SEC,
  newsBulletinActive: false,

  tickMusicPlayedSeconds: (deltaSec) => {
    if (!(deltaSec > 0) || !Number.isFinite(deltaSec)) return;
    set((state) => ({
      musicPlayedSeconds: state.musicPlayedSeconds + deltaSec,
    }));
  },

  completeNewsBulletin: (options) => {
    void options;
    set({
      newsBulletinActive: false,
      lastBulletinAtMusicSeconds: get().musicPlayedSeconds,
    });
    get().nextTrack({ skipNewsCheck: true });
  },

  markTrackFailed: (trackId) => {
    const next = new Set(get().failedTrackIds);
    next.add(trackId);
    set({
      failedTrackIds: next,
      queue: get().queue.filter((t) => t.id !== trackId),
      upcomingTrack:
        get().upcomingTrack?.id === trackId ? null : get().upcomingTrack,
    });
  },

  playTrack: (track) => {
    const { currentTrack, playbackHistory } = get();

    // Gesture-first: flip playing state and start audio before any queue work,
    // analytics, or catalog shuffle can stall the click stack.
    const nextHistory =
      currentTrack && currentTrack.id !== track.id
        ? [...playbackHistory, currentTrack]
        : playbackHistory;

    set({
      currentTrack: track,
      isPlaying: true,
      playbackHistory: nextHistory,
      playedSeconds: 0,
      duration: 0,
      ignorePlaybackErrorsUntil: Date.now() + TRACK_SWAP_GRACE_MS,
    });
    mediaPlayNow();

    queueMicrotask(() => {
      const { queue, failedTrackIds } = get();
      let remaining = queue.filter((t) => t.id !== track.id);
      if (remaining.length === 0) {
        remaining = shuffleWithArtistGap(
          useCatalogStore.getState().getRadioTracks(),
          track.artist,
          failedTrackIds,
        ).filter((t) => t.id !== track.id);
      }
      const upcoming = pickRandomTrack(
        remaining,
        track.artist,
        failedTrackIds,
      );
      set({
        upcomingTrack: upcoming,
        queue: upcoming
          ? remaining.filter((t) => t.id !== upcoming.id)
          : remaining,
      });
      trackListenEvent("play_start", track.id);
    });
  },

  togglePlay: () => {
    const { currentTrack, isPlaying, startRadio } = get();
    if (!currentTrack) {
      // No cue yet — startRadio loads + plays (may wait on catalog).
      startRadio();
      return;
    }
    // Resume/pause only — never reshuffle a cued track (keeps warm buffer).
    const nextPlaying = !isPlaying;
    set({ isPlaying: nextPlaying });
    if (nextPlaying) {
      mediaPlayNow();
      queueMicrotask(() => trackListenEvent("play_start", currentTrack.id));
    }
  },

  nextTrack: (options) => {
    if (!options?.skipNewsCheck && isClientNewsBulletinEnabled()) {
      const state = get();
      if (
        !state.newsBulletinActive &&
        state.isPlaying &&
        shouldInjectNewsBulletin(
          state.musicPlayedSeconds,
          state.lastBulletinAtMusicSeconds,
          state.newsBulletinIntervalSec,
        )
      ) {
        set({ newsBulletinActive: true, isPlaying: false });
        return;
      }
    }

    const {
      upcomingTrack,
      currentTrack,
      playbackHistory,
      queue,
      failedTrackIds,
    } = get();

    let next =
      upcomingTrack && !failedTrackIds.has(upcomingTrack.id)
        ? upcomingTrack
        : null;
    let rest = queue.filter((t) => !failedTrackIds.has(t.id));

    // Force-advance: if the queue drained mid-stream, refill from catalog
    // instead of a full reshuffle so handoff stays continuous.
    if (!next) {
      if (rest.length === 0) {
        rest = shuffleWithArtistGap(
          useCatalogStore.getState().getRadioTracks(),
          currentTrack?.artist,
          failedTrackIds,
        );
      }
      next = pickRandomTrack(rest, currentTrack?.artist, failedTrackIds);
      if (next) {
        rest = rest.filter((t) => t.id !== next!.id);
      }
    } else {
      rest = rest.filter((t) => t.id !== next!.id);
    }

    if (!next) {
      // Absolute last resort — catalog empty / all failed.
      get().startRadio();
      return;
    }

    if (currentTrack) {
      trackListenEvent("skip", currentTrack.id, get().playedSeconds);
    }

    const history =
      currentTrack && currentTrack.id !== next.id
        ? [...playbackHistory, currentTrack]
        : playbackHistory;

    if (rest.length === 0) {
      rest = shuffleWithArtistGap(
        useCatalogStore.getState().getRadioTracks(),
        next.artist,
        failedTrackIds,
      ).filter((t) => t.id !== next!.id);
    }

    const upcoming = pickRandomTrack(rest, next.artist, failedTrackIds);

    set({
      currentTrack: next,
      upcomingTrack: upcoming,
      isPlaying: true,
      queue: upcoming
        ? rest.filter((t) => t.id !== upcoming.id)
        : rest,
      playbackHistory: history,
      playedSeconds: 0,
      duration: 0,
      ignorePlaybackErrorsUntil: Date.now() + TRACK_SWAP_GRACE_MS,
    });
    trackListenEvent("play_start", next.id);
    if (!options?.skipMediaPlay) {
      mediaPlayNow();
    }
  },

  previousTrack: () => {
    const {
      playbackHistory,
      currentTrack,
      queue,
      upcomingTrack,
      failedTrackIds,
    } = get();

    if (playbackHistory.length === 0) {
      if (currentTrack) set({ playedSeconds: 0 });
      return;
    }

    const previous = playbackHistory[playbackHistory.length - 1];
    const nextHistory = playbackHistory.slice(0, -1);

    const requeue = [
      ...(upcomingTrack ? [upcomingTrack] : []),
      ...(currentTrack ? [currentTrack] : []),
      ...queue,
    ].filter(
      (t, i, arr) =>
        t.id !== previous.id &&
        !failedTrackIds.has(t.id) &&
        arr.findIndex((x) => x.id === t.id) === i,
    );

    const upcoming = pickRandomTrack(
      requeue,
      previous.artist,
      failedTrackIds,
    );

    set({
      currentTrack: previous,
      upcomingTrack: upcoming,
      isPlaying: true,
      queue: upcoming
        ? requeue.filter((t) => t.id !== upcoming.id)
        : requeue,
      playbackHistory: nextHistory,
      playedSeconds: 0,
      duration: 0,
      ignorePlaybackErrorsUntil: Date.now() + TRACK_SWAP_GRACE_MS,
    });
    mediaPlayNow();
  },

  setQueue: (nextQueue) => set({ queue: nextQueue }),

  cueRadio: (seed) => {
    if (get().currentTrack) return;

    const { failedTrackIds } = get();
    const pool =
      seed && seed.length > 0
        ? seed
        : useCatalogStore.getState().getRadioTracks();
    const shuffled = shuffleWithArtistGap(pool, undefined, failedTrackIds);
    if (shuffled.length === 0) return;

    const [first, second, ...rest] = shuffled;
    set({
      currentTrack: first,
      upcomingTrack: second ?? null,
      isPlaying: false,
      queue: rest,
      playbackHistory: [],
      playedSeconds: 0,
      duration: 0,
      ignorePlaybackErrorsUntil: Date.now() + TRACK_SWAP_GRACE_MS,
    });
  },

  startRadio: (seed) => {
    const { currentTrack, isPlaying, failedTrackIds } = get();

    // Resume a warmed cue — unmute immediately, defer analytics.
    if (!seed && currentTrack && !isPlaying) {
      set({ isPlaying: true });
      mediaPlayNow();
      queueMicrotask(() => trackListenEvent("play_start", currentTrack.id));
      return;
    }

    // Prefer keeping an already-cued track live when reshuffling isn't forced.
    if (!seed && currentTrack && isPlaying) {
      mediaPlayNow();
      return;
    }

    const pool =
      seed && seed.length > 0
        ? seed
        : useCatalogStore.getState().getRadioTracks();
    const shuffled = shuffleWithArtistGap(
      pool,
      currentTrack?.artist,
      failedTrackIds,
    );

    if (shuffled.length === 0) return;

    const [first, second, ...rest] = shuffled;
    set({
      currentTrack: first,
      upcomingTrack: second ?? null,
      isPlaying: true,
      queue: rest,
      playbackHistory: currentTrack
        ? [...get().playbackHistory, currentTrack]
        : get().playbackHistory,
      playedSeconds: 0,
      duration: 0,
      ignorePlaybackErrorsUntil: Date.now() + TRACK_SWAP_GRACE_MS,
    });
    mediaPlayNow();
    queueMicrotask(() => trackListenEvent("play_start", first.id));
  },

  stopBroadcast: () => {
    stopSilentKeepAlive();
    releaseBroadcastWakeLock();
    set({
      currentTrack: null,
      upcomingTrack: null,
      isPlaying: false,
      queue: [],
      playbackHistory: [],
      playedSeconds: 0,
      duration: 0,
      musicPlayedSeconds: 0,
      lastBulletinAtMusicSeconds: 0,
      newsBulletinActive: false,
    });
  },

  setVolume: (volume) =>
    set({ volume: Math.min(1, Math.max(0, volume)) }),

  setPlayedSeconds: (playedSeconds) => set({ playedSeconds }),

  setDuration: (duration) => set({ duration }),

  seekTo: (seconds) => {
    const { duration } = get();
    if (!(duration > 0) || !Number.isFinite(seconds)) return;
    const clamped = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.15));
    set((state) => ({
      pendingSeekSeconds: clamped,
      playedSeconds: clamped,
      seekRequestId: state.seekRequestId + 1,
    }));
  },

  clearSeekRequest: () => set({ pendingSeekSeconds: null }),

  setBroadcastEnhance: (broadcastEnhance) => set({ broadcastEnhance }),

  setStreamQuality: (streamQuality) => set({ streamQuality }),

  ensureUpcoming: () => {
    const { upcomingTrack, queue, currentTrack, failedTrackIds } = get();
    if (upcomingTrack && !failedTrackIds.has(upcomingTrack.id)) return;

    // Prefer the live queue; when drained, refill from the catalog so the
    // dual-slot engine always has a warm next source (gapless handoff).
    let pool = queue.filter((t) => !failedTrackIds.has(t.id));
    let fromCatalog = false;
    if (pool.length === 0) {
      pool = useCatalogStore.getState().getRadioTracks();
      fromCatalog = true;
    }

    const next = pickRandomTrack(pool, currentTrack?.artist, failedTrackIds);
    if (!next) return;

    const rest = fromCatalog
      ? shuffleWithArtistGap(
          pool.filter((t) => t.id !== next.id),
          next.artist,
          failedTrackIds,
        )
      : queue.filter((t) => t.id !== next.id);

    set({
      upcomingTrack: next,
      queue: rest,
    });
  },

  advanceFromBackground: (expectedTrackId) => {
    const { currentTrack, isPlaying, newsBulletinActive } = get();
    if (newsBulletinActive) return;
    if (!currentTrack) return;
    // Ignore stale Worker messages after a manual skip / track swap.
    if (expectedTrackId && currentTrack.id !== expectedTrackId) return;
    // Background catch-up: even if isPlaying flipped during a freeze window,
    // still advance when the Worker / focus recovery demands a handoff.
    if (!isPlaying) {
      set({ isPlaying: true });
    }
    get().ensureUpcoming();
    get().nextTrack({ skipNewsCheck: false });
  },
}));
