"use client";

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
  registerMediaPlayNow,
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
import { useAudioStore } from "@/store/useAudioStore";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface AudioEngineProps {
  streamingAllowed?: boolean;
}

type PlayerSlot = "a" | "b";

const PREFETCH_WINDOW_SEC = 30;
/** Start warming the next media pipeline once the live track is nearly done. */
const GAPLESS_PREFETCH_RATIO = 0.95;
const EARLY_HANDOFF_SEC = 0.25;
/** Extra lead when the tab is hidden — main-thread media events often freeze. */
const HIDDEN_HANDOFF_SEC = 2.5;
/** Grace past wall-clock end before focus recovery forces the next track. */
const DEADLINE_OVERDUE_MS = 750;
const PROMOTED_PLAY_POLL_MS = 40;
const PROMOTED_PLAY_MAX_WAIT_MS = 8_000;
const ERROR_SKIP_COOLDOWN_MS = 800;
const MAX_CONSECUTIVE_ERRORS = 8;
const PROGRESS_UI_INTERVAL_MS = 400;
const QUALITY_REASSERT_MS = 30_000;
/**
 * Muted cue warm-up soft-loops near 0 once enough data is buffered.
 * Staying muted-playing (not paused) lets Play only unmute — same as Next.
 */
const MUTED_WARM_LOOP_SEC = 1.5;
const MUTED_WARM_MIN_BUFFER_SEC = 2;

function isYoutubeConsoleNoise(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") {
    return /youtube|iframe player error|getVolume/i.test(value);
  }
  if (typeof value !== "object") return false;
  if (value instanceof Error) {
    return /youtube|iframe player error|getVolume/i.test(value.message);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.data === "number") return true;
  if (
    typeof record.message === "string" &&
    /youtube|iframe player error|getVolume/i.test(record.message)
  ) {
    return true;
  }
  try {
    const json = JSON.stringify(value);
    if (!json || json === "{}") return true;
  } catch {
    return true;
  }
  return false;
}

function benchLog(type: string, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (!(window as Window & { __RADIO_BENCH__?: boolean }).__RADIO_BENCH__) return;
  console.log(`[RADIO-BENCH] ${type}`, JSON.stringify({ at: performance.now(), ...detail }));
}

let youtubeConsolePatched = false;
function ensureYoutubeConsolePatch() {
  if (typeof window === "undefined" || youtubeConsolePatched) return;
  youtubeConsolePatched = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some(isYoutubeConsoleNoise)) return;
    if (
      args[0] instanceof TypeError &&
      /getVolume is not a function/i.test(args[0].message)
    ) {
      return;
    }
    original(...args);
  };

  const onWindowError = (event: ErrorEvent) => {
    if (/getVolume is not a function/i.test(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("error", onWindowError);
}

ensureYoutubeConsolePatch();

function youtubeSrc(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

function otherSlot(slot: PlayerSlot): PlayerSlot {
  return slot === "a" ? "b" : "a";
}

/** True when the cued slot has enough media buffered for a near-instant unmute. */
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

export default function AudioEngine({
  streamingAllowed = true,
}: AudioEngineProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const upcomingTrack = useAudioStore((s) => s.upcomingTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const volume = useAudioStore((s) => s.volume);
  const broadcastEnhance = useAudioStore((s) => s.broadcastEnhance);

  const playerARef = useRef<HTMLVideoElement | null>(null);
  const playerBRef = useRef<HTMLVideoElement | null>(null);
  const liveSlotRef = useRef<PlayerSlot>("a");
  const [liveSlot, setLiveSlot] = useState<PlayerSlot>("a");
  const [slotAId, setSlotAId] = useState<string | null>(null);
  const [slotBId, setSlotBId] = useState<string | null>(null);
  const slotAIdRef = useRef<string | null>(null);
  const slotBIdRef = useRef<string | null>(null);

  const endingRef = useRef(false);
  const lastErrorSkipAt = useRef(0);
  const consecutiveErrors = useRef(0);
  const lastProgressUiWrite = useRef(0);
  const lastTickMediaTimeRef = useRef(0);
  const durationRef = useRef(0);
  /** Absolute wall-clock ms when the live track should hand off (Date.now based). */
  const trackDeadlineAtRef = useRef(0);
  const trackDeadlineIdRef = useRef<string | null>(null);
  const nativeEndedCleanupsRef = useRef<Partial<Record<PlayerSlot, () => void>>>(
    {},
  );
  const handoffFiredRef = useRef(false);
  const prefetchedIdRef = useRef<string | null>(null);
  const skipBenchAtRef = useRef(0);
  const playingEmittedForSkipRef = useRef(0);
  const slotReadyRef = useRef<Record<PlayerSlot, string | null>>({ a: null, b: null });
  const promoteCleanupRef = useRef<(() => void) | null>(null);
  const lastPromotedTrackRef = useRef<string | null>(null);
  /** While true, keep the live slot muted-playing so the first Play only unmutes. */
  const allowMutedWarmRef = useRef(true);
  /** React state mirror — stays true through cue warm soft-loop until real Play. */
  const [cueWarmActive, setCueWarmActive] = useState(true);

  liveSlotRef.current = liveSlot;

  ensureYoutubeConsolePatch();

  const livePlayerRef = liveSlot === "a" ? playerARef : playerBRef;

  const slotRef = useCallback(
    (slot: PlayerSlot) => (slot === "a" ? playerARef : playerBRef),
    [],
  );

  const playerEl = useCallback(
    (slot: PlayerSlot) => slotRef(slot).current as YoutubePlayerElement | null,
    [slotRef],
  );

  /** Wall-clock handoff deadline — survives frozen timeupdate/ended in background tabs. */
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

  const flushStalledTrackIfOverdue = useCallback((): boolean => {
    const state = useAudioStore.getState();
    if (!state.isPlaying && !state.newsBulletinActive) return false;
    if (state.newsBulletinActive) return false;
    if (!streamingAllowed) return false;
    if (endingRef.current || handoffFiredRef.current) return false;

    const trackId = state.currentTrack?.id ?? null;
    const deadline = trackDeadlineAtRef.current;
    const deadlineTrack = trackDeadlineIdRef.current;
    if (!trackId || !deadline || deadlineTrack !== trackId) return false;
    if (Date.now() < deadline + DEADLINE_OVERDUE_MS) return false;

    benchLog("deadline:flush", { trackId, overdueMs: Date.now() - deadline });
    endingRef.current = true;
    handoffFiredRef.current = true;
    skipBenchAtRef.current = performance.now();
    trackDeadlineAtRef.current = 0;
    // Flush any stuck media buffer so the next promote starts clean.
    const media = slotRef(liveSlotRef.current).current;
    if (media) {
      try {
        media.pause();
      } catch {
        // ignore
      }
    }
    state.ensureUpcoming();
    state.advanceFromBackground(trackId);
    // nextTrack already swapped — allow future handoffs.
    endingRef.current = false;
    handoffFiredRef.current = false;
    return true;
  }, [slotRef, streamingAllowed]);

  const attachNativeEnded = useCallback(
    (slot: PlayerSlot) => {
      nativeEndedCleanupsRef.current[slot]?.();
      nativeEndedCleanupsRef.current[slot] = undefined;

      const media = slotRef(slot).current;
      if (!media) return;

      const onNativeEnded = () => {
        if (slot !== liveSlotRef.current) return;
        if (!streamingAllowed) return;
        if (endingRef.current || handoffFiredRef.current) return;
        const state = useAudioStore.getState();
        if (state.newsBulletinActive) return;
        const trackId = state.currentTrack?.id ?? null;
        benchLog("native:ended", { trackId, slot });
        endingRef.current = true;
        handoffFiredRef.current = true;
        skipBenchAtRef.current = performance.now();
        state.ensureUpcoming();
        state.nextTrack();
        if (useAudioStore.getState().newsBulletinActive) {
          endingRef.current = false;
          handoffFiredRef.current = false;
        }
        trackDeadlineAtRef.current = 0;
      };

      // Hardware-level HTMLMediaElement ended — not a React prop / setTimeout path.
      media.addEventListener("ended", onNativeEnded);

      const yt = media as YoutubePlayerElement;
      const onYtState = (data: number) => {
        // YouTube iframe API: ENDED = 0
        if (data === 0) onNativeEnded();
      };
      try {
        yt.api?.addEventListener?.("onStateChange", onYtState);
      } catch {
        // Optional iframe API path.
      }

      nativeEndedCleanupsRef.current[slot] = () => {
        media.removeEventListener("ended", onNativeEnded);
        try {
          yt.api?.removeEventListener?.("onStateChange", onYtState);
        } catch {
          // ignore
        }
      };
    },
    [slotRef, streamingAllowed],
  );

  const syncSlotAudio = useCallback(
    (slot: PlayerSlot) => {
      const isLive = slot === liveSlotRef.current;
      // Only the live slot is audible, and only while isPlaying — keeps muted
      // warm-up silent until Play runs inside a user gesture.
      const audible = isLive && useAudioStore.getState().isPlaying;
      syncPlayerAudioState(playerEl(slot), {
        volume: audible ? volume : 0,
        muted: !audible,
      });
    },
    [playerEl, volume],
  );

  const syncAllSlotsAudio = useCallback(() => {
    syncSlotAudio("a");
    syncSlotAudio("b");
  }, [syncSlotAudio]);

  const pauseSlot = useCallback(
    (slot: PlayerSlot) => {
      const media = slotRef(slot).current;
      if (media && !media.paused) {
        media.pause();
      }
      syncSlotAudio(slot);
    },
    [slotRef, syncSlotAudio],
  );

  const runSlotSync = useCallback(
    (slot: PlayerSlot = liveSlotRef.current) => {
      syncSlotAudio(slot);

      if (!broadcastEnhance || slot !== liveSlotRef.current) return;

      const quality = applyBroadcastQuality(playerEl(slot));
      if (quality) {
        useAudioStore.getState().setStreamQuality(quality);
      }
    },
    [broadcastEnhance, playerEl, syncSlotAudio],
  );

  const scheduleSlotSync = useCallback(
    (slot: PlayerSlot = liveSlotRef.current) => {
      runSlotSync(slot);
      window.setTimeout(() => runSlotSync(slot), 500);
      window.setTimeout(() => runSlotSync(slot), 2000);
    },
    [runSlotSync],
  );

  const emitPlayingBench = useCallback(
    (slot: PlayerSlot, promoted = false) => {
      if (slot !== liveSlotRef.current) return;
      if (playingEmittedForSkipRef.current === skipBenchAtRef.current) return;
      playingEmittedForSkipRef.current = skipBenchAtRef.current;
      const lagMs = skipBenchAtRef.current
        ? Math.round(performance.now() - skipBenchAtRef.current)
        : 0;
      benchLog("playing", {
        trackId: useAudioStore.getState().currentTrack?.id,
        lagMs,
        slot,
        promoted,
      });
      scheduleSlotSync(slot);
    },
    [scheduleSlotSync],
  );

  const tryPlaySlot = useCallback(
    (slot: PlayerSlot) => {
      const media = slotRef(slot).current;
      if (!media || slot !== liveSlotRef.current) return false;
      syncSlotAudio(slot);
      if (!media.paused) return true;
      // Always attempt play — gating on readyState missed gesture-safe resumes
      // on mobile where the element is loaded but readyState is still low.
      void media.play().catch(() => {});
      try {
        (media as YoutubePlayerElement).api?.playVideo?.();
      } catch {
        // Optional iframe API path.
      }
      return !media.paused;
    },
    [slotRef, syncSlotAudio],
  );

  const awaitPromotedPlayback = useCallback(
    (slot: PlayerSlot) => {
      promoteCleanupRef.current?.();
      promoteCleanupRef.current = null;

      const started = performance.now();
      const media = slotRef(slot).current;

      const finish = (promoted: boolean) => {
        if (slot !== liveSlotRef.current) return;
        emitPlayingBench(slot, promoted);
      };

      if (tryPlaySlot(slot)) {
        finish(true);
        return;
      }

      const onReady = () => {
        if (slot !== liveSlotRef.current) return;
        tryPlaySlot(slot);
        if (!media?.paused) finish(true);
      };

      media?.addEventListener("canplay", onReady, { once: true });
      media?.addEventListener("playing", onReady, { once: true });

      const pollId = window.setInterval(() => {
        if (slot !== liveSlotRef.current) {
          window.clearInterval(pollId);
          return;
        }
        if (tryPlaySlot(slot)) {
          window.clearInterval(pollId);
          finish(true);
          return;
        }
        if (performance.now() - started >= PROMOTED_PLAY_MAX_WAIT_MS) {
          window.clearInterval(pollId);
        }
      }, PROMOTED_PLAY_POLL_MS);

      promoteCleanupRef.current = () => {
        window.clearInterval(pollId);
        media?.removeEventListener("canplay", onReady);
        media?.removeEventListener("playing", onReady);
      };
    },
    [emitPlayingBench, slotRef, tryPlaySlot],
  );

  const promoteHandlersRef = useRef({
    tryPlaySlot,
    emitPlayingBench,
    awaitPromotedPlayback,
    runSlotSync,
    pauseSlot,
    syncAllSlotsAudio,
  });
  promoteHandlersRef.current = {
    tryPlaySlot,
    emitPlayingBench,
    awaitPromotedPlayback,
    runSlotSync,
    pauseSlot,
    syncAllSlotsAudio,
  };

  /**
   * Gesture-safe play: find the slot that already holds currentTrack (often the
   * muted cue warm-up), unmute + play() in this stack.
   * When the cued slot is already muted-playing, unmute alone is audible ASAP —
   * same pattern that makes Next seamless on mobile.
   */
  const playCurrentInGesture = useCallback(() => {
    if (!streamingAllowed) return false;
    const trackId = useAudioStore.getState().currentTrack?.id;
    if (!trackId || !useAudioStore.getState().isPlaying) return false;

    let target: PlayerSlot | null = null;
    if (slotAIdRef.current === trackId) target = "a";
    else if (slotBIdRef.current === trackId) target = "b";

    // Never start the wrong slot — wait for the track effect to load a new src.
    if (!target) return false;

    if (target !== liveSlotRef.current) {
      const demoted = otherSlot(target);
      liveSlotRef.current = target;
      setLiveSlot(target);
      pauseSlot(demoted);

      const upcomingId = useAudioStore.getState().upcomingTrack?.id ?? null;
      if (demoted === "a") {
        slotAIdRef.current = upcomingId;
        setSlotAId(upcomingId);
        if (upcomingId) slotReadyRef.current.a = null;
      } else {
        slotBIdRef.current = upcomingId;
        setSlotBId(upcomingId);
        if (upcomingId) slotReadyRef.current.b = null;
      }
      lastPromotedTrackRef.current = trackId;
    }

    const slot = target;
    const media = slotRef(slot).current;
    if (!media) return false;

    // Real playback — stop soft-loop warm; unmute before any async work.
    allowMutedWarmRef.current = false;
    setCueWarmActive(false);
    syncAllSlotsAudio();
    syncSlotAudio(slot);

    // Already muted-playing after cue warm → audible without waiting on play().
    if (!media.paused) {
      emitPlayingBench(slot, true);
      return true;
    }

    void media.play().catch(() => {});
    try {
      (media as YoutubePlayerElement).api?.playVideo?.();
    } catch {
      // Optional iframe API path.
    }
    if (media.paused) {
      awaitPromotedPlayback(slot);
    } else {
      emitPlayingBench(slot, true);
    }
    return true;
  }, [
    awaitPromotedPlayback,
    emitPlayingBench,
    pauseSlot,
    slotRef,
    streamingAllowed,
    syncAllSlotsAudio,
    syncSlotAudio,
  ]);

  useEffect(() => {
    registerMediaPlayNow(() => playCurrentInGesture());
    return () => registerMediaPlayNow(null);
  }, [playCurrentInGesture]);

  useEffect(() => {
    return () => {
      promoteCleanupRef.current?.();
    };
  }, []);

  const warmSlotMuted = useCallback(
    (slot: PlayerSlot) => {
      if (!allowMutedWarmRef.current) return;
      const media = slotRef(slot).current;
      if (!media) return;
      syncPlayerAudioState(playerEl(slot), { volume: 0, muted: true });
      if (media.paused) {
        void media.play().catch(() => {});
        try {
          (media as YoutubePlayerElement).api?.playVideo?.();
        } catch {
          // Optional iframe API path.
        }
      }
    },
    [playerEl, slotRef],
  );

  /**
   * Rewind the cued live slot to 0 while staying muted-playing.
   * Pausing here used to force a cold play() on the next tap (multi-second delay).
   */
  const parkMutedWarmAtStart = useCallback(
    (slot: PlayerSlot = liveSlotRef.current) => {
      if (!allowMutedWarmRef.current) return;
      const media = slotRef(slot).current;
      if (!media) return;

      try {
        media.currentTime = 0;
      } catch {
        // Some embeds reject seeks until buffered.
      }
      try {
        (media as YoutubePlayerElement).api?.seekTo?.(0, true);
      } catch {
        // Optional YouTube iframe API path.
      }

      syncPlayerAudioState(playerEl(slot), { volume: 0, muted: true });
      if (media.paused) {
        void media.play().catch(() => {});
        try {
          (media as YoutubePlayerElement).api?.playVideo?.();
        } catch {
          // Optional iframe API path.
        }
      }
      useAudioStore.getState().setPlayedSeconds(0);
    },
    [playerEl, slotRef],
  );

  useEffect(() => {
    if (!currentTrack) {
      slotAIdRef.current = null;
      slotBIdRef.current = null;
      setSlotAId(null);
      setSlotBId(null);
      liveSlotRef.current = "a";
      setLiveSlot("a");
      return;
    }

    const live = liveSlotRef.current;
    const prefetch = otherSlot(live);
    const prefetchId =
      prefetch === "a" ? slotAIdRef.current : slotBIdRef.current;

    if (
      currentTrack.id === prefetchId &&
      prefetchId &&
      slotReadyRef.current[prefetch] === prefetchId
    ) {
      if (lastPromotedTrackRef.current === currentTrack.id) return;
      lastPromotedTrackRef.current = currentTrack.id;

      benchLog("buffer:promote", {
        trackId: currentTrack.id,
        fromSlot: prefetch,
        prefetchReady: true,
      });
      const nextLive = prefetch;
      const demotedSlot = otherSlot(nextLive);
      liveSlotRef.current = nextLive;
      setLiveSlot(nextLive);

      pauseSlot(demotedSlot);

      const nextPrefetch = otherSlot(nextLive);
      if (nextPrefetch === "a") {
        slotAIdRef.current = upcomingTrack?.id ?? null;
        setSlotAId(upcomingTrack?.id ?? null);
        if (upcomingTrack?.id) slotReadyRef.current.a = null;
      } else {
        slotBIdRef.current = upcomingTrack?.id ?? null;
        setSlotBId(upcomingTrack?.id ?? null);
        if (upcomingTrack?.id) slotReadyRef.current.b = null;
      }

      queueMicrotask(() => {
        const handlers = promoteHandlersRef.current;
        const attempt = () => {
          handlers.syncAllSlotsAudio();
          handlers.runSlotSync(nextLive);
          if (handlers.tryPlaySlot(nextLive)) {
            handlers.emitPlayingBench(nextLive, true);
            return;
          }
          handlers.awaitPromotedPlayback(nextLive);
        };
        attempt();
        requestAnimationFrame(() => requestAnimationFrame(attempt));
      });
      return;
    }

    if (lastPromotedTrackRef.current !== currentTrack.id) {
      lastPromotedTrackRef.current = null;
    }

    benchLog("buffer:load", {
      trackId: currentTrack.id,
      liveSlot: live,
      prefetchReady: slotReadyRef.current[prefetch] === prefetchId,
    });

    const liveId = currentTrack.id;
    const prefetchTrackId = upcomingTrack?.id ?? null;
    let liveTrackChanged = false;

    if (live === "a") {
      if (slotAIdRef.current !== liveId) {
        slotAIdRef.current = liveId;
        setSlotAId(liveId);
        slotReadyRef.current.a = null;
        liveTrackChanged = true;
      }
      if (slotBIdRef.current !== prefetchTrackId) {
        slotBIdRef.current = prefetchTrackId;
        setSlotBId(prefetchTrackId);
        slotReadyRef.current.b = null;
      }
    } else {
      if (slotBIdRef.current !== liveId) {
        slotBIdRef.current = liveId;
        setSlotBId(liveId);
        slotReadyRef.current.b = null;
        liveTrackChanged = true;
      }
      if (slotAIdRef.current !== prefetchTrackId) {
        slotAIdRef.current = prefetchTrackId;
        setSlotAId(prefetchTrackId);
        slotReadyRef.current.a = null;
      }
    }

    if (liveTrackChanged) {
      pauseSlot(otherSlot(live));
      // Inject + activate immediately — no dependency on a manual skip.
      // Flush any pending tap so mobile cold-starts unmute in the gesture window.
      queueMicrotask(() => {
        promoteHandlersRef.current.syncAllSlotsAudio();
        if (useAudioStore.getState().isPlaying) {
          if (!flushPendingMediaPlay()) {
            promoteHandlersRef.current.awaitPromotedPlayback(live);
          }
        } else if (allowMutedWarmRef.current) {
          warmSlotMuted(live);
          warmSlotMuted(otherSlot(live));
        }
      });
      requestAnimationFrame(() => {
        if (useAudioStore.getState().isPlaying) {
          flushPendingMediaPlay();
        }
      });
    } else if (useAudioStore.getState().isPlaying) {
      // Same live id but engine just mounted / recovered — force buffer activation.
      queueMicrotask(() => {
        flushPendingMediaPlay();
      });
    }
  }, [currentTrack?.id, upcomingTrack?.id, pauseSlot, warmSlotMuted]);

  useEffect(() => {
    if (!currentTrack) return;
    endingRef.current = false;
    handoffFiredRef.current = false;
    consecutiveErrors.current = 0;
    durationRef.current = 0;
    lastProgressUiWrite.current = 0;
    lastTickMediaTimeRef.current = 0;
    trackDeadlineAtRef.current = 0;
    trackDeadlineIdRef.current = currentTrack.id;
    skipBenchAtRef.current = performance.now();
    useAudioStore.getState().setPlayedSeconds(0);
    useAudioStore.getState().setDuration(0);
    useAudioStore.getState().setStreamQuality(null);
    benchLog("track:change", {
      trackId: currentTrack.id,
      title: currentTrack.title,
    });
  }, [currentTrack?.id, currentTrack?.title]);

  const seekRequestId = useAudioStore((s) => s.seekRequestId);
  const pendingSeekSeconds = useAudioStore((s) => s.pendingSeekSeconds);

  useEffect(() => {
    if (pendingSeekSeconds == null) return;
    // User picked a position — never rewind the muted cue warm-up back to 0.
    allowMutedWarmRef.current = false;
    setCueWarmActive(false);

    const media = slotRef(liveSlotRef.current).current;
    const target = Math.max(0, pendingSeekSeconds);

    const applySeek = () => {
      if (!media) return;
      try {
        const max =
          Number.isFinite(media.duration) && media.duration > 0
            ? media.duration - 0.15
            : target;
        media.currentTime = Math.min(target, Math.max(0, max));
      } catch {
        // Some embeds reject seeks until buffered.
      }
      const yt = media as YoutubePlayerElement;
      try {
        yt.api?.seekTo?.(target, true);
      } catch {
        // Optional YouTube iframe API path.
      }
    };

    applySeek();
    const retryId = window.requestAnimationFrame(applySeek);
    lastProgressUiWrite.current = performance.now();
    useAudioStore.getState().setPlayedSeconds(target);
    useAudioStore.getState().clearSeekRequest();
    return () => window.cancelAnimationFrame(retryId);
  }, [seekRequestId, pendingSeekSeconds, slotRef]);

  useEffect(() => {
    if (!streamingAllowed || !currentTrack) return;
    useAudioStore.getState().ensureUpcoming();
  }, [streamingAllowed, currentTrack?.id]);

  useEffect(() => {
    if (!currentTrack) {
      allowMutedWarmRef.current = true;
      setCueWarmActive(true);
      return;
    }
    // New cued track while paused: allow a fresh muted buffer pass.
    if (!useAudioStore.getState().isPlaying) {
      allowMutedWarmRef.current = true;
      setCueWarmActive(true);
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!isPlaying) {
      if (
        allowMutedWarmRef.current &&
        cueWarmActive &&
        streamingAllowed &&
        currentTrack
      ) {
        // Pre-start muted (allowed without a user gesture) so Play can unmute
        // inside the tap handler instead of waiting on a cold YouTube buffer.
        warmSlotMuted(liveSlotRef.current);
        warmSlotMuted(otherSlot(liveSlotRef.current));
        return;
      }
      pauseSlot("a");
      pauseSlot("b");
      return;
    }
    allowMutedWarmRef.current = false;
    setCueWarmActive(false);
    if (!streamingAllowed) return;
    syncAllSlotsAudio();
    const slot = liveSlotRef.current;
    if (!tryPlaySlot(slot)) {
      awaitPromotedPlayback(slot);
    }
  }, [
    isPlaying,
    streamingAllowed,
    currentTrack,
    liveSlot,
    cueWarmActive,
    pauseSlot,
    syncAllSlotsAudio,
    tryPlaySlot,
    awaitPromotedPlayback,
    warmSlotMuted,
  ]);

  useEffect(() => {
    syncAllSlotsAudio();
  }, [volume, syncAllSlotsAudio]);

  useEffect(() => {
    if (!broadcastEnhance || !isPlaying) return;
    runSlotSync();
    const id = window.setInterval(() => runSlotSync(), QUALITY_REASSERT_MS);
    return () => window.clearInterval(id);
  }, [broadcastEnhance, isPlaying, runSlotSync, liveSlot, currentTrack?.id]);

  useEffect(() => {
    if (!upcomingTrack || !streamingAllowed) return;
    if (!isPlaying && !allowMutedWarmRef.current) return;
    if (prefetchedIdRef.current === upcomingTrack.id) return;
    prefetchedIdRef.current = upcomingTrack.id;

    const origins = [
      "https://www.youtube.com",
      "https://i.ytimg.com",
      "https://www.googlevideo.com",
      "https://www.youtube-nocookie.com",
    ];
    for (const href of origins) {
      if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      document.head.appendChild(link);
    }

    benchLog("prefetch:start", { trackId: upcomingTrack.id });
  }, [upcomingTrack?.id, upcomingTrack?.youtubeId, streamingAllowed, isPlaying]);

  const advanceNow = useCallback(() => {
    if (endingRef.current) return;
    if (useAudioStore.getState().newsBulletinActive) return;
    endingRef.current = true;
    handoffFiredRef.current = true;
    consecutiveErrors.current = 0;
    skipBenchAtRef.current = performance.now();
    benchLog("skip:request");
    useAudioStore.getState().nextTrack();
    if (useAudioStore.getState().newsBulletinActive) {
      endingRef.current = false;
      handoffFiredRef.current = false;
    }
  }, []);

  const heartbeatRef = useRef<QueueHeartbeatController | null>(null);
  const advanceNowRef = useRef(advanceNow);
  advanceNowRef.current = advanceNow;
  const lastHeartbeatSyncAt = useRef(0);

  const syncQueueHeartbeat = useCallback(
    (playedSec?: number, force = false) => {
      const heartbeat = heartbeatRef.current;
      if (!heartbeat) return;
      const now = performance.now();
      // Throttle routine syncs; always allow forced sync (track change / visibility).
      if (!force && now - lastHeartbeatSyncAt.current < 250) return;
      lastHeartbeatSyncAt.current = now;

      const state = useAudioStore.getState();
      const trackId = state.currentTrack?.id ?? null;
      const durationSec =
        durationRef.current > 0 ? durationRef.current : state.duration;
      const media = slotRef(liveSlotRef.current).current;
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
    [armTrackDeadline, slotRef, streamingAllowed],
  );

  // Isolated Worker heartbeat — wall-clock deadlines survive background-tab freezes.
  useEffect(() => {
    const heartbeat = createQueueHeartbeat({
      onAdvance: (trackId) => {
        const state = useAudioStore.getState();
        if (!streamingAllowed) return;
        if (state.newsBulletinActive) return;
        if (state.currentTrack?.id !== trackId) return;
        if (endingRef.current || handoffFiredRef.current) return;
        benchLog("heartbeat:advance", { trackId });
        endingRef.current = true;
        handoffFiredRef.current = true;
        skipBenchAtRef.current = performance.now();
        trackDeadlineAtRef.current = 0;
        // Store path — does not depend on React effects / setTimeout.
        state.advanceFromBackground(trackId);
        if (useAudioStore.getState().newsBulletinActive) {
          endingRef.current = false;
          handoffFiredRef.current = false;
        }
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
      syncQueueHeartbeat(undefined, true);
      if (document.visibilityState !== "visible") return;
      if (!streamingAllowed) return;

      // Absolute deadline catch-up: if JS froze past the track end, jump now.
      if (flushStalledTrackIfOverdue()) {
        flushPendingMediaPlay();
        return;
      }

      const state = useAudioStore.getState();
      if (!state.isPlaying) return;

      const media = slotRef(liveSlotRef.current).current;
      const dur = durationRef.current;
      if (
        media &&
        dur > 0 &&
        (media.ended ||
          (Number.isFinite(media.currentTime) &&
            dur - media.currentTime <= HIDDEN_HANDOFF_SEC))
      ) {
        if (!endingRef.current && !handoffFiredRef.current) {
          state.ensureUpcoming();
          advanceNowRef.current();
        }
      } else {
        flushPendingMediaPlay();
        tryPlaySlot(liveSlotRef.current);
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
    slotRef,
    streamingAllowed,
    syncQueueHeartbeat,
    tryPlaySlot,
  ]);

  useEffect(() => {
    syncQueueHeartbeat(0, true);
  }, [currentTrack?.id, isPlaying, streamingAllowed, syncQueueHeartbeat]);

  const handleEnded = useCallback(() => {
    if (!streamingAllowed) return;
    if (endingRef.current || handoffFiredRef.current) return;
    // Force the succeeding track into the engine immediately — never stall
    // waiting for another user action after natural track termination.
    useAudioStore.getState().ensureUpcoming();
    advanceNow();
  }, [advanceNow, streamingAllowed]);

  // OS Media Session keep-alive — marks RithmGen as a priority background audio worker.
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
    const handlers = {
      onPlay: () => {
        const state = useAudioStore.getState();
        if (!state.isPlaying) state.togglePlay();
      },
      onPause: () => {
        const state = useAudioStore.getState();
        if (state.isPlaying) state.togglePlay();
      },
      onNext: () => useAudioStore.getState().nextTrack(),
      onPrevious: () => useAudioStore.getState().previousTrack(),
    };
    return bindMediaSessionActions(handlers);
  }, []);

  useEffect(() => {
    return () => {
      for (const slot of ["a", "b"] as PlayerSlot[]) {
        nativeEndedCleanupsRef.current[slot]?.();
        nativeEndedCleanupsRef.current[slot] = undefined;
      }
    };
  }, []);

  const handleError = useCallback(() => {
    if (!streamingAllowed) return;
    if (Date.now() < useAudioStore.getState().ignorePlaybackErrorsUntil) {
      return;
    }
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

    advanceNow();
  }, [advanceNow, streamingAllowed]);

  const handleTimeUpdate = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const media = event.currentTarget;
      const t = media.currentTime;
      if (!Number.isFinite(t)) return;

      // Muted cue warm-up: soft-loop near 0 once buffered. Never write progress
      // UI (keeps seek/clock still) and never auto-skip while Play is shown.
      if (!useAudioStore.getState().isPlaying) {
        if (
          allowMutedWarmRef.current &&
          t >= MUTED_WARM_LOOP_SEC &&
          hasWarmBuffer(media)
        ) {
          parkMutedWarmAtStart(liveSlotRef.current);
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
        if (delta > 0) {
          audioState.tickMusicPlayedSeconds(delta);
        }
      }
      lastTickMediaTimeRef.current = t;

      const dur = durationRef.current;
      const remaining = dur > 0 ? dur - t : Infinity;
      const progressRatio = dur > 0 ? t / dur : 0;

      // Gapless: ensure the next track is selected and the prefetch slot is
      // warming well before end — at 95% completion and again in the final 30s.
      if (
        progressRatio >= GAPLESS_PREFETCH_RATIO ||
        remaining <= PREFETCH_WINDOW_SEC + 1
      ) {
        useAudioStore.getState().ensureUpcoming();
        const prefetch = otherSlot(liveSlotRef.current);
        const prefetchId =
          prefetch === "a" ? slotAIdRef.current : slotBIdRef.current;
        const upcomingId = useAudioStore.getState().upcomingTrack?.id ?? null;
        if (upcomingId && prefetchId === upcomingId) {
          // Keep the standby slot muted-playing so promote is instant.
          const prefetchMedia = slotRef(prefetch).current;
          if (prefetchMedia) {
            syncPlayerAudioState(playerEl(prefetch), {
              volume: 0,
              muted: true,
            });
            if (prefetchMedia.paused) {
              void prefetchMedia.play().catch(() => {});
              try {
                (prefetchMedia as YoutubePlayerElement).api?.playVideo?.();
              } catch {
                // Optional iframe API path.
              }
            }
          }
        } else if (upcomingId && prefetchId !== upcomingId) {
          // Upcoming changed — let the track effect rebind the prefetch src.
          prefetchedIdRef.current = null;
        }
      }

      const handoffSec =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
          ? HIDDEN_HANDOFF_SEC
          : EARLY_HANDOFF_SEC;

      if (
        remaining <= handoffSec &&
        remaining > 0 &&
        !handoffFiredRef.current
      ) {
        advanceNow();
        return;
      }

      // Keep the Worker wall-clock deadline aligned with real media time.
      syncQueueHeartbeat(t);
      armTrackDeadline(t, dur, audioState.currentTrack?.id ?? null);
      syncMediaSessionPosition({ duration: dur, position: t });

      const now = performance.now();
      if (now - lastProgressUiWrite.current >= PROGRESS_UI_INTERVAL_MS) {
        lastProgressUiWrite.current = now;
        useAudioStore.getState().setPlayedSeconds(t);
      }
    },
    [
      advanceNow,
      armTrackDeadline,
      parkMutedWarmAtStart,
      playerEl,
      slotRef,
      syncQueueHeartbeat,
    ],
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

  const handleReady = useCallback(
    (slot: PlayerSlot, trackId: string | null) => {
      consecutiveErrors.current = 0;
      if (trackId) slotReadyRef.current[slot] = trackId;
      const isLive = slot === liveSlotRef.current;
      benchLog(isLive ? "player:ready" : "prefetch:ready", {
        trackId,
        slot,
      });
      attachNativeEnded(slot);
      const media = slotRef(slot).current;
      if (media && streamingAllowed && isPlaying) {
        syncSlotAudio(slot);
        void media.play().catch(() => {});
      } else if (
        media &&
        streamingAllowed &&
        allowMutedWarmRef.current &&
        !isPlaying
      ) {
        warmSlotMuted(slot);
      } else {
        syncSlotAudio(slot);
      }
      queueMicrotask(() => scheduleSlotSync(slot));
    },
    [
      attachNativeEnded,
      scheduleSlotSync,
      slotRef,
      streamingAllowed,
      isPlaying,
      syncSlotAudio,
      warmSlotMuted,
    ],
  );

  const handlePlaying = useCallback(
    (slot: PlayerSlot) => {
      if (slot !== liveSlotRef.current) return;
      consecutiveErrors.current = 0;
      emitPlayingBench(slot, false);
    },
    [emitPlayingBench],
  );

  const handleCanPlay = useCallback(
    (slot: PlayerSlot, trackId: string | null) => {
      if (trackId) slotReadyRef.current[slot] = trackId;
      if (slot === liveSlotRef.current) {
        if (isPlaying) {
          tryPlaySlot(slot);
          const media = slotRef(slot).current;
          if (media && !media.paused) {
            emitPlayingBench(slot, false);
          }
        } else if (streamingAllowed && allowMutedWarmRef.current) {
          warmSlotMuted(slot);
        }
        return;
      }
      benchLog("prefetch:buffered", { trackId, slot });
      if (streamingAllowed && isPlaying) {
        syncSlotAudio(slot);
        const media = slotRef(slot).current;
        if (media) void media.play().catch(() => {});
      } else if (streamingAllowed && allowMutedWarmRef.current) {
        warmSlotMuted(slot);
      } else {
        syncSlotAudio(slot);
      }
    },
    [
      emitPlayingBench,
      isPlaying,
      slotRef,
      streamingAllowed,
      syncSlotAudio,
      tryPlaySlot,
      warmSlotMuted,
    ],
  );

  const handlePause = useCallback(
    (slot: PlayerSlot) => {
      if (!streamingAllowed) return;
      if (isPlaying) {
        // Prefetch must stay muted-playing for seamless next; ignore live pauses.
        if (slot === liveSlotRef.current) return;
        syncSlotAudio(slot);
        const media = slotRef(slot).current;
        if (media) void media.play().catch(() => {});
        return;
      }
      if (allowMutedWarmRef.current) {
        warmSlotMuted(slot);
      }
    },
    [isPlaying, slotRef, streamingAllowed, syncSlotAudio, warmSlotMuted],
  );

  const handlePrefetchError = useCallback(
    (trackId: string | null) => {
      if (!trackId) return;
      useAudioStore.getState().markTrackFailed(trackId);
      useAudioStore.getState().ensureUpcoming();
    },
    [],
  );

  const resolveTrack = useCallback(
    (trackId: string | null) => {
      if (!trackId) return null;
      if (currentTrack?.id === trackId) return currentTrack;
      if (upcomingTrack?.id === trackId) return upcomingTrack;
      return null;
    },
    [currentTrack, upcomingTrack],
  );

  if (!currentTrack) return null;

  const renderSlot = (slot: PlayerSlot) => {
    const trackId = slot === "a" ? slotAId : slotBId;
    const track = resolveTrack(trackId);
    if (!track) return null;

    const isLive = slot === liveSlot;
    const ref = slot === "a" ? playerARef : playerBRef;
    // Muted warm while cued: keep playing=true so the slot stays hot; soft-loop
    // parks near 0 without pausing. Live stays muted until isPlaying.
    const warming = !isPlaying && cueWarmActive && allowMutedWarmRef.current;
    const shouldPlay = streamingAllowed && (isPlaying || warming);
    const slotMuted = !isLive || !isPlaying;
    const slotVolume = isLive && isPlaying ? volume : 0;

    return (
      <ReactPlayer
        ref={ref}
        key={`slot-${slot}`}
        src={youtubeSrc(track.youtubeId)}
        playing={shouldPlay}
        volume={slotVolume}
        muted={slotMuted}
        width={BROADCAST_PLAYER_WIDTH}
        height={BROADCAST_PLAYER_HEIGHT}
        controls={false}
        playsInline
        preload="auto"
        config={{ youtube: YOUTUBE_PLAYER_CONFIG }}
        onReady={() => handleReady(slot, trackId)}
        onEnded={isLive ? handleEnded : undefined}
        onError={
          isLive
            ? handleError
            : () => handlePrefetchError(trackId)
        }
        onPlaying={() => handlePlaying(slot)}
        onPause={() => handlePause(slot)}
        onCanPlay={() => handleCanPlay(slot, trackId)}
        onTimeUpdate={isLive ? handleTimeUpdate : undefined}
        onDurationChange={isLive ? handleDurationChange : undefined}
      />
    );
  };

  // Keep iframe props at 1920×1080 for YouTube adaptive quality, but NEVER size
  // this shell to 1920px — a fixed 1920-wide box makes iOS Safari rubber-band
  // horizontally (paywall/auth appear shifted left with a dead gap on the right).
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
        {renderSlot("a")}
        {renderSlot("b")}
      </div>
    </div>
  );
}
