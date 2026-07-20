"use client";

/**
 * Single-Instance Persistent Player
 *
 * One ReactPlayer / media node for the whole radio session. Track changes only
 * swap the source on that same node (YouTube loadVideoById / .src) — we never
 * destroy, remount, or dual-slot promote between songs. Native `ended` injects
 * the next URL from the store's raw queue before React paints, so background
 * tabs cannot GC the media session between tracks.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import dynamic from "next/dynamic";
import {
  applyBroadcastQuality,
  BROADCAST_PLAYER_HEIGHT,
  BROADCAST_PLAYER_WIDTH,
  syncPlayerAudioState,
  YOUTUBE_PLAYER_CONFIG,
  type YoutubePlayerElement,
} from "@/lib/broadcastAudio";
import {
  flushPendingMediaPlay,
  forcePlayMedia,
  registerMediaPlayNow,
  registerPersistentAdvance,
  startSilentKeepAlive,
} from "@/lib/mediaPlayback";
import {
  createQueueHeartbeat,
  type QueueHeartbeatController,
} from "@/lib/queueHeartbeat";
import {
  bindMediaSessionActions,
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
  syncMediaSessionPosition,
} from "@/lib/mediaSession";
import {
  reassertBroadcastWakeLock,
  requestBroadcastWakeLock,
} from "@/lib/wakeLock";
import {
  isClientNewsBulletinEnabled,
  shouldInjectNewsBulletin,
} from "@/lib/broadcastSchedule";
import { useAudioStore } from "@/store/useAudioStore";
import type { Track } from "@/data/tracks";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface AudioEngineProps {
  streamingAllowed?: boolean;
}

const PREFETCH_WINDOW_SEC = 30;
const GAPLESS_PREFETCH_RATIO = 0.95;
const EARLY_HANDOFF_SEC = 0.25;
const HIDDEN_HANDOFF_SEC = 2.5;
const DEADLINE_OVERDUE_MS = 750;
const ERROR_SKIP_COOLDOWN_MS = 800;
const MAX_CONSECUTIVE_ERRORS = 8;
const PROGRESS_UI_INTERVAL_MS = 400;
const QUALITY_REASSERT_MS = 30_000;
const MUTED_WARM_LOOP_SEC = 1.5;
const MUTED_WARM_MIN_BUFFER_SEC = 2;

/** Stable forever — remounting this key would recreate the media node. */
const PERSISTENT_PLAYER_KEY = "rithmgen-persistent-player";

function youtubeSrc(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

function hasWarmBuffer(media: HTMLMediaElement, minSec = MUTED_WARM_MIN_BUFFER_SEC) {
  try {
    if (media.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return true;
    if (media.buffered.length === 0) {
      return media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    }
    const end = media.buffered.end(media.buffered.length - 1);
    return end >= minSec || end - media.currentTime >= minSec;
  } catch {
    return media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }
}

function benchLog(type: string, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (!(window as Window & { __RADIO_BENCH__?: boolean }).__RADIO_BENCH__) return;
  console.log(
    `[RADIO-BENCH] ${type}`,
    JSON.stringify({ at: performance.now(), ...detail }),
  );
}

let youtubeConsolePatched = false;
function ensureYoutubeConsolePatch() {
  if (typeof window === "undefined" || youtubeConsolePatched) return;
  youtubeConsolePatched = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (
      args.some((value) => {
        if (value == null) return true;
        if (typeof value === "string") {
          return /youtube|iframe player error|getVolume/i.test(value);
        }
        if (value instanceof Error) {
          return /youtube|iframe player error|getVolume/i.test(value.message);
        }
        return false;
      })
    ) {
      return;
    }
    original(...args);
  };
}

ensureYoutubeConsolePatch();

/**
 * Imperatively swap the persistent node's source WITHOUT unmounting it.
 * Prefer YouTube iframe API loadVideoById; fall back to HTMLMediaElement.src.
 */
function injectSourceOnPersistentNode(
  media: HTMLMediaElement | null,
  youtubeId: string,
): void {
  if (!media || !youtubeId) return;
  const yt = media as YoutubePlayerElement;
  const url = youtubeSrc(youtubeId);

  try {
    yt.api?.loadVideoById?.({ videoId: youtubeId, startSeconds: 0 });
  } catch {
    try {
      yt.api?.loadVideoById?.(youtubeId);
    } catch {
      // Fall through to element src swap.
    }
  }

  try {
    if (typeof (media as HTMLMediaElement).src === "string") {
      const el = media as HTMLMediaElement;
      if (el.src !== url && !el.src.includes(youtubeId)) {
        el.src = url;
        el.load();
      }
    }
  } catch {
    // YouTube iframe wrappers may not expose a writable src.
  }
}

export default function AudioEngine({
  streamingAllowed = true,
}: AudioEngineProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const volume = useAudioStore((s) => s.volume);
  const broadcastEnhance = useAudioStore((s) => s.broadcastEnhance);
  const seekRequestId = useAudioStore((s) => s.seekRequestId);
  const pendingSeekSeconds = useAudioStore((s) => s.pendingSeekSeconds);

  /** THE single permanent media node — never replaced between tracks. */
  const playerRef = useRef<HTMLVideoElement | null>(null);
  /** Last src kept so the node stays mounted when store briefly clears. */
  const lastSrcRef = useRef("");
  const lastYoutubeIdRef = useRef<string | null>(null);
  const mountedOnceRef = useRef(false);

  const endingRef = useRef(false);
  const handoffFiredRef = useRef(false);
  const lastErrorSkipAt = useRef(0);
  const consecutiveErrors = useRef(0);
  const lastProgressUiWrite = useRef(0);
  const lastTickMediaTimeRef = useRef(0);
  const durationRef = useRef(0);
  const trackDeadlineAtRef = useRef(0);
  const trackDeadlineIdRef = useRef<string | null>(null);
  const nativeEndedCleanupRef = useRef<(() => void) | null>(null);
  const skipBenchAtRef = useRef(0);
  const playingEmittedForSkipRef = useRef(0);
  const allowMutedWarmRef = useRef(true);
  const [cueWarmActive, setCueWarmActive] = useState(true);
  /** React mirror of the persistent src — updated AFTER imperative inject. */
  const [playerSrc, setPlayerSrc] = useState("");

  ensureYoutubeConsolePatch();

  const mediaEl = useCallback(
    () => playerRef.current as YoutubePlayerElement | null,
    [],
  );

  const syncAudio = useCallback(() => {
    const audible = useAudioStore.getState().isPlaying && streamingAllowed;
    syncPlayerAudioState(mediaEl(), {
      volume: audible ? volume : 0,
      muted: !audible,
    });
  }, [mediaEl, streamingAllowed, volume]);

  const tryPlay = useCallback(() => {
    const media = playerRef.current;
    if (!media) return false;
    syncAudio();
    if (!media.paused) return true;
    return forcePlayMedia(media);
  }, [syncAudio]);

  const armTrackDeadline = useCallback(
    (playedSec: number, durationSec: number, trackId: string | null) => {
      if (!trackId || !(durationSec > 0) || !Number.isFinite(durationSec)) {
        trackDeadlineAtRef.current = 0;
        trackDeadlineIdRef.current = null;
        return;
      }
      const remaining = Math.max(0, durationSec - Math.max(0, playedSec));
      const hidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";
      const lead = hidden ? HIDDEN_HANDOFF_SEC : EARLY_HANDOFF_SEC;
      trackDeadlineAtRef.current =
        Date.now() + Math.max(0, remaining - lead) * 1000;
      trackDeadlineIdRef.current = trackId;
    },
    [],
  );

  /**
   * Peek the next Track from raw store arrays (no React). Used by native ended
   * so we can inject the URL before any layout paint / setState flush.
   */
  const peekNextTrack = useCallback((): Track | null => {
    const state = useAudioStore.getState();
    state.ensureUpcoming();
    const after = useAudioStore.getState();
    const failed = after.failedTrackIds;
    if (after.upcomingTrack && !failed.has(after.upcomingTrack.id)) {
      return after.upcomingTrack;
    }
    const rest = after.queue.filter((t) => !failed.has(t.id));
    if (rest.length > 0) return rest[0] ?? null;
    return null;
  }, []);

  /**
   * Core handoff: inject next URL into the SAME node, then sync Zustand.
   * Independent of React re-renders — safe in hidden tabs.
   */
  const advancePersistent = useCallback(
    (reason: string) => {
      if (!streamingAllowed) return;
      if (endingRef.current || handoffFiredRef.current) return;
      const state = useAudioStore.getState();
      if (state.newsBulletinActive) return;

      const next = peekNextTrack();
      if (!next) {
        // Fall back to store reshuffle; still keep the same media node.
        endingRef.current = true;
        handoffFiredRef.current = true;
        skipBenchAtRef.current = performance.now();
        state.nextTrack({ skipNewsCheck: false });
        endingRef.current = false;
        handoffFiredRef.current = false;
        return;
      }

      // News must win BEFORE we touch the media node — otherwise we'd inject
      // the next song and then pause for a bulletin.
      if (
        isClientNewsBulletinEnabled() &&
        state.isPlaying &&
        !state.newsBulletinActive &&
        shouldInjectNewsBulletin(
          state.musicPlayedSeconds,
          state.lastBulletinAtMusicSeconds,
          state.newsBulletinIntervalSec,
        )
      ) {
        endingRef.current = true;
        handoffFiredRef.current = true;
        useAudioStore.getState().nextTrack({ skipNewsCheck: false });
        endingRef.current = false;
        handoffFiredRef.current = false;
        return;
      }

      endingRef.current = true;
      handoffFiredRef.current = true;
      skipBenchAtRef.current = performance.now();
      trackDeadlineAtRef.current = 0;
      benchLog("persistent:advance", { reason, nextId: next.id });

      // 1) Keep silent keep-alive + wake lock alive across the swap.
      startSilentKeepAlive();
      requestBroadcastWakeLock();

      // 2) Inject source on the permanent node BEFORE React state updates.
      lastYoutubeIdRef.current = next.youtubeId;
      lastSrcRef.current = youtubeSrc(next.youtubeId);
      injectSourceOnPersistentNode(playerRef.current, next.youtubeId);
      setPlayerSrc(lastSrcRef.current);

      // 3) Unmute + play immediately on the same instance.
      try {
        const media = playerRef.current;
        if (media) {
          media.muted = false;
          media.volume = Math.min(
            1,
            Math.max(0, useAudioStore.getState().volume),
          );
        }
        const yt = mediaEl();
        yt?.api?.unMute?.();
        yt?.api?.setVolume?.(
          Math.round(
            Math.min(1, Math.max(0, useAudioStore.getState().volume)) * 100,
          ),
        );
        yt?.api?.playVideo?.();
      } catch {
        // forcePlay below still runs.
      }
      forcePlayMedia(playerRef.current);

      // 4) Sync store for UI — skip mediaPlayNow (already playing) + news check
      //    (already handled above).
      useAudioStore.getState().nextTrack({
        skipNewsCheck: true,
        skipMediaPlay: true,
      });

      // Confirm the store landed on the track we injected.
      const landed = useAudioStore.getState().currentTrack;
      if (landed && landed.youtubeId !== lastYoutubeIdRef.current) {
        lastYoutubeIdRef.current = landed.youtubeId;
        lastSrcRef.current = youtubeSrc(landed.youtubeId);
        injectSourceOnPersistentNode(playerRef.current, landed.youtubeId);
        setPlayerSrc(lastSrcRef.current);
        forcePlayMedia(playerRef.current);
      }

      durationRef.current = 0;
      lastTickMediaTimeRef.current = 0;
      endingRef.current = false;
      handoffFiredRef.current = false;
    },
    [mediaEl, peekNextTrack, streamingAllowed],
  );

  const advancePersistentRef = useRef(advancePersistent);
  advancePersistentRef.current = advancePersistent;

  const flushStalledTrackIfOverdue = useCallback((): boolean => {
    const state = useAudioStore.getState();
    if (!state.isPlaying || state.newsBulletinActive) return false;
    if (!streamingAllowed) return false;
    if (endingRef.current || handoffFiredRef.current) return false;

    const trackId = state.currentTrack?.id ?? null;
    const deadline = trackDeadlineAtRef.current;
    const deadlineTrack = trackDeadlineIdRef.current;
    if (!trackId || !deadline || deadlineTrack !== trackId) return false;
    if (Date.now() < deadline + DEADLINE_OVERDUE_MS) return false;

    benchLog("deadline:flush", { trackId, overdueMs: Date.now() - deadline });
    advancePersistentRef.current("deadline");
    return true;
  }, [streamingAllowed]);

  const attachNativeEnded = useCallback(() => {
    nativeEndedCleanupRef.current?.();
    nativeEndedCleanupRef.current = null;

    const media = playerRef.current;
    if (!media) return;

    const onNativeEnded = () => {
      if (!streamingAllowed) return;
      if (endingRef.current || handoffFiredRef.current) return;
      if (useAudioStore.getState().newsBulletinActive) return;
      benchLog("native:ended", {
        trackId: useAudioStore.getState().currentTrack?.id,
      });
      // Pull next URL from raw queue and inject — no React paint wait.
      advancePersistentRef.current("ended");
    };

    media.addEventListener("ended", onNativeEnded, { capture: true });
    try {
      media.onended = onNativeEnded;
    } catch {
      // Some embeds expose a read-only onended.
    }

    const yt = media as YoutubePlayerElement;
    const onYtState = (data: number) => {
      if (data === 0) onNativeEnded();
    };
    try {
      yt.api?.addEventListener?.("onStateChange", onYtState);
    } catch {
      // Optional iframe API path.
    }

    nativeEndedCleanupRef.current = () => {
      media.removeEventListener("ended", onNativeEnded, {
        capture: true,
      } as EventListenerOptions);
      try {
        if (media.onended === onNativeEnded) media.onended = null;
      } catch {
        // ignore
      }
      try {
        yt.api?.removeEventListener?.("onStateChange", onYtState);
      } catch {
        // ignore
      }
    };
  }, [streamingAllowed]);

  const parkMutedWarmAtStart = useCallback(() => {
    if (!allowMutedWarmRef.current) return;
    const media = playerRef.current;
    if (!media) return;
    try {
      media.currentTime = 0;
    } catch {
      // ignore
    }
    try {
      (media as YoutubePlayerElement).api?.seekTo?.(0, true);
    } catch {
      // ignore
    }
    syncPlayerAudioState(mediaEl(), { volume: 0, muted: true });
    if (media.paused) forcePlayMedia(media);
  }, [mediaEl]);

  const warmMuted = useCallback(() => {
    if (!allowMutedWarmRef.current) return;
    const media = playerRef.current;
    if (!media) return;
    syncPlayerAudioState(mediaEl(), { volume: 0, muted: true });
    if (media.paused) forcePlayMedia(media);
  }, [mediaEl]);

  /** Gesture-safe play on the single persistent node. */
  const playCurrentInGesture = useCallback(() => {
    if (!streamingAllowed) return false;
    const track = useAudioStore.getState().currentTrack;
    if (!track || !useAudioStore.getState().isPlaying) return false;

    allowMutedWarmRef.current = false;
    setCueWarmActive(false);
    startSilentKeepAlive();
    requestBroadcastWakeLock();

    const media = playerRef.current;
    if (!media) return false;

    // Ensure the persistent node holds this track (src swap, never remount).
    if (lastYoutubeIdRef.current !== track.youtubeId) {
      lastYoutubeIdRef.current = track.youtubeId;
      lastSrcRef.current = youtubeSrc(track.youtubeId);
      injectSourceOnPersistentNode(media, track.youtubeId);
      setPlayerSrc(lastSrcRef.current);
    }

    try {
      media.muted = false;
      media.volume = Math.min(1, Math.max(0, volume));
      const yt = media as YoutubePlayerElement;
      yt.api?.unMute?.();
      yt.api?.setVolume?.(Math.round(Math.min(1, Math.max(0, volume)) * 100));
    } catch {
      // sync below
    }

    forcePlayMedia(media);
    queueMicrotask(() => {
      syncAudio();
      if (media.paused) forcePlayMedia(media);
    });
    return true;
  }, [streamingAllowed, syncAudio, volume]);

  useEffect(() => {
    registerMediaPlayNow(() => playCurrentInGesture());
    return () => registerMediaPlayNow(null);
  }, [playCurrentInGesture]);

  useEffect(() => {
    registerPersistentAdvance((reason) => advancePersistentRef.current(reason));
    return () => registerPersistentAdvance(null);
  }, []);

  // Keep the permanent src in sync when the store changes (manual next / playTrack).
  // Never unmount — only swap source on the existing node.
  useEffect(() => {
    if (!currentTrack) return;
    mountedOnceRef.current = true;
    const url = youtubeSrc(currentTrack.youtubeId);
    if (lastYoutubeIdRef.current === currentTrack.youtubeId) return;

    lastYoutubeIdRef.current = currentTrack.youtubeId;
    lastSrcRef.current = url;
    setPlayerSrc(url);
    injectSourceOnPersistentNode(playerRef.current, currentTrack.youtubeId);

    endingRef.current = false;
    handoffFiredRef.current = false;
    consecutiveErrors.current = 0;
    durationRef.current = 0;
    lastTickMediaTimeRef.current = 0;
    trackDeadlineAtRef.current = 0;

    if (useAudioStore.getState().isPlaying) {
      allowMutedWarmRef.current = false;
      setCueWarmActive(false);
      startSilentKeepAlive();
      requestBroadcastWakeLock();
      queueMicrotask(() => {
        syncAudio();
        if (!tryPlay()) {
          // Retry once the iframe finishes loading the new id.
          window.setTimeout(() => tryPlay(), 120);
          window.setTimeout(() => tryPlay(), 400);
        }
        flushPendingMediaPlay();
      });
    } else {
      allowMutedWarmRef.current = true;
      setCueWarmActive(true);
      queueMicrotask(() => warmMuted());
    }
  }, [currentTrack?.id, currentTrack?.youtubeId, syncAudio, tryPlay, warmMuted]);

  useEffect(() => {
    if (!isPlaying) {
      if (
        allowMutedWarmRef.current &&
        cueWarmActive &&
        streamingAllowed &&
        currentTrack
      ) {
        warmMuted();
        return;
      }
      try {
        playerRef.current?.pause();
      } catch {
        // ignore
      }
      syncAudio();
      return;
    }
    allowMutedWarmRef.current = false;
    setCueWarmActive(false);
    if (!streamingAllowed) return;
    startSilentKeepAlive();
    requestBroadcastWakeLock();
    syncAudio();
    if (!tryPlay()) {
      window.setTimeout(() => tryPlay(), 80);
    }
  }, [
    isPlaying,
    streamingAllowed,
    currentTrack,
    cueWarmActive,
    syncAudio,
    tryPlay,
    warmMuted,
  ]);

  useEffect(() => {
    syncAudio();
  }, [volume, syncAudio]);

  useEffect(() => {
    if (!broadcastEnhance || !isPlaying) return;
    const run = () => {
      syncAudio();
      const quality = applyBroadcastQuality(mediaEl());
      if (quality) useAudioStore.getState().setStreamQuality(quality);
    };
    run();
    const id = window.setInterval(run, QUALITY_REASSERT_MS);
    return () => window.clearInterval(id);
  }, [broadcastEnhance, isPlaying, mediaEl, syncAudio, currentTrack?.id]);

  // Seek requests
  useEffect(() => {
    if (pendingSeekSeconds == null) return;
    const media = playerRef.current;
    if (!media) return;
    const target = pendingSeekSeconds;
    try {
      media.currentTime = target;
    } catch {
      // ignore
    }
    try {
      (media as YoutubePlayerElement).api?.seekTo?.(target, true);
    } catch {
      // ignore
    }
    useAudioStore.getState().setPlayedSeconds(target);
    useAudioStore.getState().clearSeekRequest();
  }, [seekRequestId, pendingSeekSeconds]);

  useEffect(() => {
    if (!streamingAllowed || !currentTrack) return;
    useAudioStore.getState().ensureUpcoming();
  }, [streamingAllowed, currentTrack?.id]);

  const heartbeatRef = useRef<QueueHeartbeatController | null>(null);
  const lastHeartbeatSyncAt = useRef(0);

  const syncQueueHeartbeat = useCallback(
    (playedSec?: number, force = false) => {
      const heartbeat = heartbeatRef.current;
      if (!heartbeat) return;
      const now = performance.now();
      if (!force && now - lastHeartbeatSyncAt.current < 250) return;
      lastHeartbeatSyncAt.current = now;

      const state = useAudioStore.getState();
      const trackId = state.currentTrack?.id ?? null;
      const durationSec =
        durationRef.current > 0 ? durationRef.current : state.duration;
      const media = playerRef.current;
      const played =
        typeof playedSec === "number" && Number.isFinite(playedSec)
          ? playedSec
          : media && Number.isFinite(media.currentTime)
            ? media.currentTime
            : state.playedSeconds;
      const hidden =
        typeof document !== "undefined"
          ? document.visibilityState === "hidden"
          : false;

      heartbeat.sync({
        trackId,
        durationSec,
        playedSec: played,
        isPlaying: state.isPlaying && streamingAllowed && !!trackId,
        handoffSec: hidden ? HIDDEN_HANDOFF_SEC : EARLY_HANDOFF_SEC,
        prefetchRatio: GAPLESS_PREFETCH_RATIO,
      });

      if (state.isPlaying && trackId && durationSec > 0) {
        armTrackDeadline(played, durationSec, trackId);
      }
    },
    [armTrackDeadline, streamingAllowed],
  );

  useEffect(() => {
    const heartbeat = createQueueHeartbeat({
      onAdvance: (trackId) => {
        const state = useAudioStore.getState();
        if (!streamingAllowed) return;
        if (state.newsBulletinActive) return;
        if (state.currentTrack?.id !== trackId) return;
        advancePersistentRef.current("heartbeat");
      },
      onPrefetch: (trackId) => {
        const state = useAudioStore.getState();
        if (state.currentTrack?.id !== trackId) return;
        state.ensureUpcoming();
      },
    });
    heartbeatRef.current = heartbeat;
    syncQueueHeartbeat(undefined, true);

    const onVisibility = () => {
      reassertBroadcastWakeLock();
      startSilentKeepAlive();
      syncQueueHeartbeat(undefined, true);
      if (document.visibilityState !== "visible") return;
      if (!streamingAllowed) return;

      if (flushStalledTrackIfOverdue()) {
        flushPendingMediaPlay();
        return;
      }

      const state = useAudioStore.getState();
      if (!state.isPlaying) return;

      const media = playerRef.current;
      const dur = durationRef.current;
      if (
        media &&
        dur > 0 &&
        (media.ended ||
          (Number.isFinite(media.currentTime) &&
            dur - media.currentTime <= HIDDEN_HANDOFF_SEC))
      ) {
        advancePersistentRef.current("visibility");
      } else {
        flushPendingMediaPlay();
        tryPlay();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      heartbeat.dispose();
      heartbeatRef.current = null;
    };
  }, [
    flushStalledTrackIfOverdue,
    streamingAllowed,
    syncQueueHeartbeat,
    tryPlay,
  ]);

  useEffect(() => {
    syncQueueHeartbeat(0, true);
  }, [currentTrack?.id, isPlaying, streamingAllowed, syncQueueHeartbeat]);

  // OS Media Session — permanent background-audio classification.
  useEffect(() => {
    if (!currentTrack) {
      syncMediaSessionPlaybackState("none");
      return;
    }
    syncMediaSessionMetadata(currentTrack);
    syncMediaSessionPlaybackState(
      isPlaying && streamingAllowed ? "playing" : "paused",
    );
  }, [currentTrack, isPlaying, streamingAllowed]);

  useEffect(() => {
    return bindMediaSessionActions({
      onPlay: () => {
        const state = useAudioStore.getState();
        if (!state.isPlaying) state.togglePlay();
      },
      onPause: () => {
        const state = useAudioStore.getState();
        if (state.isPlaying) state.togglePlay();
      },
      onNext: () => {
        // Manual next — still use persistent inject path.
        advancePersistentRef.current("mediasession-next");
      },
      onPrevious: () => useAudioStore.getState().previousTrack(),
    });
  }, []);

  useEffect(() => {
    return () => {
      nativeEndedCleanupRef.current?.();
      nativeEndedCleanupRef.current = null;
    };
  }, []);

  const handleError = useCallback(() => {
    if (!streamingAllowed) return;
    if (Date.now() < useAudioStore.getState().ignorePlaybackErrorsUntil) return;
    if (endingRef.current) return;

    const now = Date.now();
    if (now - lastErrorSkipAt.current < ERROR_SKIP_COOLDOWN_MS) return;
    lastErrorSkipAt.current = now;

    consecutiveErrors.current += 1;
    const failedId = useAudioStore.getState().currentTrack?.id;
    if (failedId) useAudioStore.getState().markTrackFailed(failedId);

    if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
      useAudioStore.setState({ isPlaying: false });
      endingRef.current = false;
      consecutiveErrors.current = 0;
      return;
    }

    advancePersistentRef.current("error");
  }, [streamingAllowed]);

  const handleTimeUpdate = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const media = event.currentTarget;
      const t = media.currentTime;
      if (!Number.isFinite(t)) return;

      if (!useAudioStore.getState().isPlaying) {
        if (
          allowMutedWarmRef.current &&
          t >= MUTED_WARM_LOOP_SEC &&
          hasWarmBuffer(media)
        ) {
          parkMutedWarmAtStart();
        }
        lastTickMediaTimeRef.current = 0;
        return;
      }

      const audioState = useAudioStore.getState();
      if (audioState.newsBulletinActive) {
        lastTickMediaTimeRef.current = 0;
        return;
      }

      const lastSample = lastTickMediaTimeRef.current;
      if (lastSample > 0 && t >= lastSample) {
        const delta = Math.min(t - lastSample, 2.5);
        if (delta > 0) audioState.tickMusicPlayedSeconds(delta);
      }
      lastTickMediaTimeRef.current = t;

      const dur = durationRef.current;
      const remaining = dur > 0 ? dur - t : Infinity;
      const progressRatio = dur > 0 ? t / dur : 0;

      if (
        progressRatio >= GAPLESS_PREFETCH_RATIO ||
        remaining <= PREFETCH_WINDOW_SEC + 1
      ) {
        useAudioStore.getState().ensureUpcoming();
      }

      syncQueueHeartbeat(t);
      armTrackDeadline(t, dur, audioState.currentTrack?.id ?? null);
      syncMediaSessionPosition({ duration: dur, position: t });

      const now = performance.now();
      if (now - lastProgressUiWrite.current >= PROGRESS_UI_INTERVAL_MS) {
        lastProgressUiWrite.current = now;
        useAudioStore.getState().setPlayedSeconds(t);
      }
    },
    [armTrackDeadline, parkMutedWarmAtStart, syncQueueHeartbeat],
  );

  const handleDurationChange = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const media = event.currentTarget;
      if (Number.isFinite(media.duration) && media.duration > 0) {
        durationRef.current = media.duration;
        useAudioStore.getState().setDuration(media.duration);
        const played = Number.isFinite(media.currentTime)
          ? media.currentTime
          : 0;
        syncQueueHeartbeat(played, true);
        armTrackDeadline(
          played,
          media.duration,
          useAudioStore.getState().currentTrack?.id ?? null,
        );
        syncMediaSessionPosition({
          duration: media.duration,
          position: played,
        });
      }
    },
    [armTrackDeadline, syncQueueHeartbeat],
  );

  const handleReady = useCallback(() => {
    consecutiveErrors.current = 0;
    attachNativeEnded();
    const media = playerRef.current;
    if (media && streamingAllowed && isPlaying) {
      syncAudio();
      forcePlayMedia(media);
    } else if (media && streamingAllowed && allowMutedWarmRef.current) {
      warmMuted();
    } else {
      syncAudio();
    }
  }, [attachNativeEnded, isPlaying, streamingAllowed, syncAudio, warmMuted]);

  const handlePlaying = useCallback(() => {
    consecutiveErrors.current = 0;
    if (playingEmittedForSkipRef.current === skipBenchAtRef.current) return;
    playingEmittedForSkipRef.current = skipBenchAtRef.current;
    const lagMs = skipBenchAtRef.current
      ? Math.round(performance.now() - skipBenchAtRef.current)
      : 0;
    benchLog("playing", {
      trackId: useAudioStore.getState().currentTrack?.id,
      lagMs,
      persistent: true,
    });
    syncAudio();
    if (broadcastEnhance) {
      const quality = applyBroadcastQuality(mediaEl());
      if (quality) useAudioStore.getState().setStreamQuality(quality);
    }
  }, [broadcastEnhance, mediaEl, syncAudio]);

  const handleCanPlay = useCallback(() => {
    attachNativeEnded();
    if (isPlaying) {
      tryPlay();
      flushPendingMediaPlay();
    } else if (streamingAllowed && allowMutedWarmRef.current) {
      warmMuted();
    }
  }, [attachNativeEnded, isPlaying, streamingAllowed, tryPlay, warmMuted]);

  const handlePause = useCallback(() => {
    if (!streamingAllowed) return;
    if (isPlaying) {
      // Autoplay policy pause mid-session — force the same node back to life.
      forcePlayMedia(playerRef.current);
      return;
    }
    if (allowMutedWarmRef.current) warmMuted();
  }, [isPlaying, streamingAllowed, warmMuted]);

  // Always keep the player shell mounted once we've ever had a track, so the
  // media node is never destroyed between songs or brief store clears.
  const src = playerSrc || lastSrcRef.current;
  const showPlayer = Boolean(src) || Boolean(currentTrack);
  if (!showPlayer && !mountedOnceRef.current) return null;

  const warming =
    Boolean(currentTrack) &&
    !isPlaying &&
    cueWarmActive &&
    allowMutedWarmRef.current;
  const shouldPlay =
    streamingAllowed && Boolean(currentTrack) && (isPlaying || warming);
  const slotMuted = !isPlaying || !currentTrack;
  const slotVolume = isPlaying && currentTrack ? volume : 0;
  // playerSrc wins — imperative handoff sets it before Zustand catches up.
  // Preferring currentTrack here would briefly re-point React at the old song.
  const resolvedSrc =
    playerSrc ||
    lastSrcRef.current ||
    (currentTrack ? youtubeSrc(currentTrack.youtubeId) : "");

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px overflow-hidden opacity-0"
      style={{
        clipPath: "inset(50%)",
        contain: "strict",
      }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: BROADCAST_PLAYER_WIDTH,
          height: BROADCAST_PLAYER_HEIGHT,
        }}
      >
        {resolvedSrc ? (
          <ReactPlayer
            ref={playerRef}
            key={PERSISTENT_PLAYER_KEY}
            src={resolvedSrc}
            playing={shouldPlay}
            volume={slotVolume}
            muted={slotMuted}
            width={BROADCAST_PLAYER_WIDTH}
            height={BROADCAST_PLAYER_HEIGHT}
            controls={false}
            playsInline
            preload="auto"
            config={{ youtube: YOUTUBE_PLAYER_CONFIG }}
            onReady={handleReady}
            onError={handleError}
            onPlaying={handlePlaying}
            onPause={handlePause}
            onCanPlay={handleCanPlay}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={() => advancePersistentRef.current("react-ended")}
          />
        ) : null}
      </div>
    </div>
  );
}
