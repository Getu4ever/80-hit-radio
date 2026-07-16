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
  applyBroadcastEnhancement,
  BROADCAST_PLAYER_HEIGHT,
  BROADCAST_PLAYER_WIDTH,
  YOUTUBE_PLAYER_CONFIG,
  type YoutubePlayerElement,
} from "@/lib/broadcastAudio";
import { useAudioStore } from "@/store/useAudioStore";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface AudioEngineProps {
  streamingAllowed?: boolean;
}

type PlayerSlot = "a" | "b";

const PREFETCH_WINDOW_SEC = 30;
const EARLY_HANDOFF_SEC = 0.25;
const PROMOTED_PLAY_POLL_MS = 40;
const PROMOTED_PLAY_MAX_WAIT_MS = 8_000;
const ERROR_SKIP_COOLDOWN_MS = 800;
const MAX_CONSECUTIVE_ERRORS = 8;
const PROGRESS_UI_INTERVAL_MS = 400;
const QUALITY_REASSERT_MS = 30_000;

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
  const durationRef = useRef(0);
  const handoffFiredRef = useRef(false);
  const prefetchedIdRef = useRef<string | null>(null);
  const skipBenchAtRef = useRef(0);
  const playingEmittedForSkipRef = useRef(0);
  const slotReadyRef = useRef<Record<PlayerSlot, string | null>>({ a: null, b: null });
  const promoteCleanupRef = useRef<(() => void) | null>(null);
  const lastPromotedTrackRef = useRef<string | null>(null);

  liveSlotRef.current = liveSlot;

  ensureYoutubeConsolePatch();

  const livePlayerRef = liveSlot === "a" ? playerARef : playerBRef;

  const runEnhancement = useCallback(
    (slot: PlayerSlot = liveSlotRef.current) => {
      if (!broadcastEnhance) return;
      const ref = slot === "a" ? playerARef : playerBRef;
      const quality = applyBroadcastEnhancement(
        ref.current as YoutubePlayerElement | null,
        volume,
      );
      if (quality && slot === liveSlotRef.current) {
        useAudioStore.getState().setStreamQuality(quality);
      }
    },
    [broadcastEnhance, volume],
  );

  const scheduleEnhancement = useCallback(
    (slot: PlayerSlot = liveSlotRef.current) => {
      runEnhancement(slot);
      window.setTimeout(() => runEnhancement(slot), 500);
      window.setTimeout(() => runEnhancement(slot), 2000);
    },
    [runEnhancement],
  );

  const slotRef = useCallback(
    (slot: PlayerSlot) => (slot === "a" ? playerARef : playerBRef),
    [],
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
      scheduleEnhancement(slot);
    },
    [scheduleEnhancement],
  );

  const tryPlaySlot = useCallback(
    (slot: PlayerSlot) => {
      const media = slotRef(slot).current;
      if (!media || slot !== liveSlotRef.current) return false;
      if (!media.paused) return true;
      if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        void media.play().catch(() => {});
      }
      return !media.paused;
    },
    [slotRef],
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
    runEnhancement,
  });
  promoteHandlersRef.current = {
    tryPlaySlot,
    emitPlayingBench,
    awaitPromotedPlayback,
    runEnhancement,
  };

  useEffect(() => {
    return () => {
      promoteCleanupRef.current?.();
    };
  }, []);

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
      const nextPrefetch = otherSlot(nextLive);
      liveSlotRef.current = nextLive;
      setLiveSlot(nextLive);

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
          handlers.runEnhancement(nextLive);
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
      queueMicrotask(() => {
        promoteHandlersRef.current.awaitPromotedPlayback(live);
      });
    }
  }, [currentTrack?.id, upcomingTrack?.id]);

  useEffect(() => {
    if (!currentTrack) return;
    endingRef.current = false;
    handoffFiredRef.current = false;
    consecutiveErrors.current = 0;
    durationRef.current = 0;
    lastProgressUiWrite.current = 0;
    skipBenchAtRef.current = performance.now();
    useAudioStore.getState().setPlayedSeconds(0);
    useAudioStore.getState().setDuration(0);
    useAudioStore.getState().setStreamQuality(null);
    benchLog("track:change", {
      trackId: currentTrack.id,
      title: currentTrack.title,
    });
  }, [currentTrack?.id, currentTrack?.title]);

  useEffect(() => {
    if (!streamingAllowed || !currentTrack) return;
    useAudioStore.getState().ensureUpcoming();
  }, [streamingAllowed, currentTrack?.id]);

  useEffect(() => {
    if (!broadcastEnhance || !isPlaying) return;
    runEnhancement();
    const id = window.setInterval(runEnhancement, QUALITY_REASSERT_MS);
    return () => window.clearInterval(id);
  }, [broadcastEnhance, isPlaying, runEnhancement, liveSlot, currentTrack?.id]);

  useEffect(() => {
    if (!broadcastEnhance) return;
    runEnhancement();
  }, [volume, broadcastEnhance, runEnhancement]);

  useEffect(() => {
    if (!upcomingTrack || !streamingAllowed || !isPlaying) return;
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
    endingRef.current = true;
    handoffFiredRef.current = true;
    consecutiveErrors.current = 0;
    skipBenchAtRef.current = performance.now();
    benchLog("skip:request");
    useAudioStore.getState().nextTrack();
  }, []);

  const handleEnded = useCallback(() => {
    if (!streamingAllowed) return;
    advanceNow();
  }, [advanceNow, streamingAllowed]);

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

      const dur = durationRef.current;
      const remaining = dur > 0 ? dur - t : Infinity;

      if (remaining <= PREFETCH_WINDOW_SEC + 1) {
        useAudioStore.getState().ensureUpcoming();
      }

      if (
        remaining <= EARLY_HANDOFF_SEC &&
        remaining > 0 &&
        !handoffFiredRef.current
      ) {
        advanceNow();
        return;
      }

      const now = performance.now();
      if (now - lastProgressUiWrite.current >= PROGRESS_UI_INTERVAL_MS) {
        lastProgressUiWrite.current = now;
        useAudioStore.getState().setPlayedSeconds(t);
      }
    },
    [advanceNow],
  );

  const handleDurationChange = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const media = event.currentTarget;
      if (Number.isFinite(media.duration) && media.duration > 0) {
        durationRef.current = media.duration;
        useAudioStore.getState().setDuration(media.duration);
      }
    },
    [],
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
      const media = slotRef(slot).current;
      if (media && streamingAllowed && isPlaying) {
        void media.play().catch(() => {});
      }
      queueMicrotask(() => scheduleEnhancement(slot));
    },
    [scheduleEnhancement, slotRef, streamingAllowed, isPlaying],
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
        tryPlaySlot(slot);
        const media = slotRef(slot).current;
        if (media && !media.paused) {
          emitPlayingBench(slot, false);
        }
        return;
      }
      benchLog("prefetch:buffered", { trackId, slot });
      const media = slotRef(slot).current;
      if (media && streamingAllowed && isPlaying) {
        void media.play().catch(() => {});
      }
    },
    [emitPlayingBench, isPlaying, slotRef, streamingAllowed, tryPlaySlot],
  );

  const handlePause = useCallback(
    (slot: PlayerSlot) => {
      if (slot === liveSlotRef.current) return;
      const media = slotRef(slot).current;
      if (media && streamingAllowed && isPlaying) {
        void media.play().catch(() => {});
      }
    },
    [isPlaying, slotRef, streamingAllowed],
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
    const shouldPlay = streamingAllowed && isPlaying;

    return (
      <ReactPlayer
        ref={ref}
        key={`slot-${slot}`}
        src={youtubeSrc(track.youtubeId)}
        playing={shouldPlay}
        volume={isLive ? volume : 0}
        muted={!isLive}
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

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 -z-10 overflow-hidden opacity-0"
      style={{
        width: BROADCAST_PLAYER_WIDTH,
        height: BROADCAST_PLAYER_HEIGHT,
        clipPath: "inset(100%)",
      }}
    >
      {renderSlot("a")}
      {renderSlot("b")}
    </div>
  );
}
