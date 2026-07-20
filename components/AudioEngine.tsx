"use client";

/**
 * Dual Persistent Slot Engine
 *
 * Background browsers block cold YouTube play() after a track ends. The fix is
 * two permanent ReactPlayer nodes that NEVER unmount: live (audible) + standby
 * (muted, already buffering/playing the next song). Handoff only unmutes the
 * standby — no new autoplay evaluation, no media GC between songs.
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

type PlayerSlot = "a" | "b";

const PREFETCH_WINDOW_SEC = 45;
const GAPLESS_PREFETCH_RATIO = 0.9;
const EARLY_HANDOFF_SEC = 0.35;
/** Start promote early in hidden tabs — timeupdate/ended often freeze. */
const HIDDEN_HANDOFF_SEC = 6;
const DEADLINE_OVERDUE_MS = 500;
const ERROR_SKIP_COOLDOWN_MS = 800;
const MAX_CONSECUTIVE_ERRORS = 8;
const PROGRESS_UI_INTERVAL_MS = 400;
const QUALITY_REASSERT_MS = 30_000;
const MUTED_WARM_LOOP_SEC = 1.5;
const MUTED_WARM_MIN_BUFFER_SEC = 2;
const STANDBY_REASSERT_MS = 3_000;

function youtubeSrc(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

function otherSlot(slot: PlayerSlot): PlayerSlot {
  return slot === "a" ? "b" : "a";
}

function isTabHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
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

function injectYoutubeId(media: HTMLMediaElement | null, youtubeId: string) {
  if (!media || !youtubeId) return;
  const yt = media as YoutubePlayerElement;
  try {
    yt.api?.loadVideoById?.({ videoId: youtubeId, startSeconds: 0 });
  } catch {
    try {
      yt.api?.loadVideoById?.(youtubeId);
    } catch {
      // React src prop is the durable fallback.
    }
  }
}

function playMuted(media: HTMLMediaElement | null) {
  if (!media) return;
  syncPlayerAudioState(media as YoutubePlayerElement, { volume: 0, muted: true });
  forcePlayMedia(media);
}

function playAudible(media: HTMLMediaElement | null, volume: number) {
  if (!media) return;
  try {
    media.muted = false;
    media.volume = Math.min(1, Math.max(0, volume));
    const yt = media as YoutubePlayerElement;
    yt.api?.unMute?.();
    yt.api?.setVolume?.(Math.round(Math.min(1, Math.max(0, volume)) * 100));
  } catch {
    // continue
  }
  syncPlayerAudioState(media as YoutubePlayerElement, {
    volume,
    muted: false,
  });
  forcePlayMedia(media);
}

export default function AudioEngine({
  streamingAllowed = true,
}: AudioEngineProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const upcomingTrack = useAudioStore((s) => s.upcomingTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const volume = useAudioStore((s) => s.volume);
  const broadcastEnhance = useAudioStore((s) => s.broadcastEnhance);
  const seekRequestId = useAudioStore((s) => s.seekRequestId);
  const pendingSeekSeconds = useAudioStore((s) => s.pendingSeekSeconds);

  const playerARef = useRef<HTMLVideoElement | null>(null);
  const playerBRef = useRef<HTMLVideoElement | null>(null);
  const liveSlotRef = useRef<PlayerSlot>("a");
  const [liveSlot, setLiveSlot] = useState<PlayerSlot>("a");
  const [slotAId, setSlotAId] = useState<string | null>(null);
  const [slotBId, setSlotBId] = useState<string | null>(null);
  const slotAIdRef = useRef<string | null>(null);
  const slotBIdRef = useRef<string | null>(null);
  const lastSrcRef = useRef<Record<PlayerSlot, string>>({ a: "", b: "" });

  const endingRef = useRef(false);
  const handoffFiredRef = useRef(false);
  const lastErrorSkipAt = useRef(0);
  const consecutiveErrors = useRef(0);
  const lastProgressUiWrite = useRef(0);
  const lastTickMediaTimeRef = useRef(0);
  const durationRef = useRef(0);
  const trackDeadlineAtRef = useRef(0);
  const trackDeadlineIdRef = useRef<string | null>(null);
  const nativeEndedCleanupsRef = useRef<Partial<Record<PlayerSlot, () => void>>>(
    {},
  );
  const lastPromotedTrackRef = useRef<string | null>(null);
  const allowMutedWarmRef = useRef(true);
  const [cueWarmActive, setCueWarmActive] = useState(true);
  const heartbeatRef = useRef<QueueHeartbeatController | null>(null);
  const lastHeartbeatSyncAt = useRef(0);

  liveSlotRef.current = liveSlot;

  const slotRef = useCallback(
    (slot: PlayerSlot) => (slot === "a" ? playerARef : playerBRef),
    [],
  );

  const syncSlotAudio = useCallback(
    (slot: PlayerSlot) => {
      const isLive = slot === liveSlotRef.current;
      const audible =
        isLive && useAudioStore.getState().isPlaying && streamingAllowed;
      syncPlayerAudioState(slotRef(slot).current as YoutubePlayerElement | null, {
        volume: audible ? volume : 0,
        muted: !audible,
      });
    },
    [slotRef, streamingAllowed, volume],
  );

  const syncAllAudio = useCallback(() => {
    syncSlotAudio("a");
    syncSlotAudio("b");
  }, [syncSlotAudio]);

  const keepStandbyHot = useCallback(() => {
    if (!streamingAllowed) return;
    if (!useAudioStore.getState().isPlaying && !allowMutedWarmRef.current) return;
    const standby = otherSlot(liveSlotRef.current);
    const media = slotRef(standby).current;
    if (!media) return;
    // Muted autoplay is allowed without a gesture — keep standby always running.
    playMuted(media);
  }, [slotRef, streamingAllowed]);

  const armTrackDeadline = useCallback(
    (playedSec: number, durationSec: number, trackId: string | null) => {
      if (!trackId || !(durationSec > 0) || !Number.isFinite(durationSec)) {
        trackDeadlineAtRef.current = 0;
        trackDeadlineIdRef.current = null;
        return;
      }
      const remaining = Math.max(0, durationSec - Math.max(0, playedSec));
      const lead = isTabHidden() ? HIDDEN_HANDOFF_SEC : EARLY_HANDOFF_SEC;
      trackDeadlineAtRef.current =
        Date.now() + Math.max(0, remaining - lead) * 1000;
      trackDeadlineIdRef.current = trackId;
    },
    [],
  );

  const shouldSkipNewsForBackground = useCallback(() => {
    // Pausing for news in a hidden tab kills the continuous media session.
    return isTabHidden();
  }, []);

  /**
   * Promote the already-playing standby → live. This is the ONLY safe way to
   * advance YouTube in a background tab (unmute, never cold-start).
   */
  const promoteStandby = useCallback(
    (reason: string) => {
      if (!streamingAllowed) return;
      if (endingRef.current || handoffFiredRef.current) return;

      const state = useAudioStore.getState();
      if (state.newsBulletinActive) return;
      if (!state.isPlaying && reason !== "error") return;

      // News only when the tab is visible — background must keep music flowing.
      if (
        !shouldSkipNewsForBackground() &&
        isClientNewsBulletinEnabled() &&
        state.isPlaying &&
        shouldInjectNewsBulletin(
          state.musicPlayedSeconds,
          state.lastBulletinAtMusicSeconds,
          state.newsBulletinIntervalSec,
        )
      ) {
        endingRef.current = true;
        handoffFiredRef.current = true;
        state.nextTrack({ skipNewsCheck: false });
        endingRef.current = false;
        handoffFiredRef.current = false;
        return;
      }

      state.ensureUpcoming();
      const next =
        useAudioStore.getState().upcomingTrack ??
        useAudioStore.getState().queue[0] ??
        null;
      if (!next) {
        endingRef.current = true;
        handoffFiredRef.current = true;
        useAudioStore.getState().nextTrack({
          skipNewsCheck: true,
          skipMediaPlay: false,
        });
        endingRef.current = false;
        handoffFiredRef.current = false;
        return;
      }

      endingRef.current = true;
      handoffFiredRef.current = true;
      trackDeadlineAtRef.current = 0;
      startSilentKeepAlive();
      requestBroadcastWakeLock();

      const live = liveSlotRef.current;
      const standby = otherSlot(live);
      const standbyId =
        standby === "a" ? slotAIdRef.current : slotBIdRef.current;
      const standbyMedia = slotRef(standby).current;
      const liveMedia = slotRef(live).current;

      // Prefer promote when standby already holds the next track.
      const canPromote = standbyId === next.id && !!standbyMedia;

      if (canPromote) {
        liveSlotRef.current = standby;
        setLiveSlot(standby);
        lastPromotedTrackRef.current = next.id;

        // Unmute standby FIRST while it is still playing — no cold play().
        playAudible(standbyMedia, useAudioStore.getState().volume);

        // Soft-pause old live (don't destroy the node).
        try {
          liveMedia?.pause();
        } catch {
          // ignore
        }
        syncSlotAudio(live);

        // Rebind demoted slot to the track after next (warm pipeline).
        useAudioStore.getState().nextTrack({
          skipNewsCheck: true,
          skipMediaPlay: true,
        });
        const after = useAudioStore.getState().upcomingTrack;
        const demoted = live;
        if (demoted === "a") {
          slotAIdRef.current = after?.id ?? null;
          setSlotAId(after?.id ?? null);
          if (after) {
            lastSrcRef.current.a = youtubeSrc(after.youtubeId);
            injectYoutubeId(liveMedia, after.youtubeId);
          }
        } else {
          slotBIdRef.current = after?.id ?? null;
          setSlotBId(after?.id ?? null);
          if (after) {
            lastSrcRef.current.b = youtubeSrc(after.youtubeId);
            injectYoutubeId(liveMedia, after.youtubeId);
          }
        }
        queueMicrotask(() => {
          playMuted(slotRef(demoted).current);
          playAudible(slotRef(standby).current, useAudioStore.getState().volume);
          syncAllAudio();
        });
      } else {
        // Standby not ready — load next onto current live node as last resort,
        // but keep keep-alive running and aggressively retry play.
        lastPromotedTrackRef.current = next.id;
        if (live === "a") {
          slotAIdRef.current = next.id;
          setSlotAId(next.id);
          lastSrcRef.current.a = youtubeSrc(next.youtubeId);
        } else {
          slotBIdRef.current = next.id;
          setSlotBId(next.id);
          lastSrcRef.current.b = youtubeSrc(next.youtubeId);
        }
        injectYoutubeId(liveMedia, next.youtubeId);
        playAudible(liveMedia, useAudioStore.getState().volume);

        useAudioStore.getState().nextTrack({
          skipNewsCheck: true,
          skipMediaPlay: true,
        });
        const after = useAudioStore.getState().upcomingTrack;
        const demoted = standby;
        if (demoted === "a") {
          slotAIdRef.current = after?.id ?? null;
          setSlotAId(after?.id ?? null);
          if (after) {
            lastSrcRef.current.a = youtubeSrc(after.youtubeId);
            injectYoutubeId(slotRef("a").current, after.youtubeId);
          }
        } else {
          slotBIdRef.current = after?.id ?? null;
          setSlotBId(after?.id ?? null);
          if (after) {
            lastSrcRef.current.b = youtubeSrc(after.youtubeId);
            injectYoutubeId(slotRef("b").current, after.youtubeId);
          }
        }
        queueMicrotask(() => {
          playMuted(slotRef(demoted).current);
          playAudible(slotRef(live).current, useAudioStore.getState().volume);
          // Background retries — YouTube may reject the first play().
          window.setTimeout(() => {
            playAudible(
              slotRef(liveSlotRef.current).current,
              useAudioStore.getState().volume,
            );
          }, 200);
          window.setTimeout(() => {
            playAudible(
              slotRef(liveSlotRef.current).current,
              useAudioStore.getState().volume,
            );
          }, 800);
          syncAllAudio();
        });
      }

      durationRef.current = 0;
      lastTickMediaTimeRef.current = 0;
      consecutiveErrors.current = 0;
      endingRef.current = false;
      handoffFiredRef.current = false;
    },
    [
      shouldSkipNewsForBackground,
      slotRef,
      streamingAllowed,
      syncAllAudio,
      syncSlotAudio,
    ],
  );

  const promoteRef = useRef(promoteStandby);
  promoteRef.current = promoteStandby;

  const attachNativeEnded = useCallback(
    (slot: PlayerSlot) => {
      nativeEndedCleanupsRef.current[slot]?.();
      nativeEndedCleanupsRef.current[slot] = undefined;

      const media = slotRef(slot).current;
      if (!media) return;

      const onEnded = () => {
        if (slot !== liveSlotRef.current) return;
        if (!streamingAllowed) return;
        if (endingRef.current || handoffFiredRef.current) return;
        if (useAudioStore.getState().newsBulletinActive) return;
        promoteRef.current("ended");
      };

      media.addEventListener("ended", onEnded, { capture: true });
      try {
        media.onended = onEnded;
      } catch {
        // ignore
      }

      const yt = media as YoutubePlayerElement;
      const onYtState = (data: number) => {
        if (data === 0) onEnded();
      };
      try {
        yt.api?.addEventListener?.("onStateChange", onYtState);
      } catch {
        // ignore
      }

      nativeEndedCleanupsRef.current[slot] = () => {
        media.removeEventListener("ended", onEnded, {
          capture: true,
        } as EventListenerOptions);
        try {
          if (media.onended === onEnded) media.onended = null;
        } catch {
          // ignore
        }
        try {
          yt.api?.removeEventListener?.("onStateChange", onYtState);
        } catch {
          // ignore
        }
      };
    },
    [slotRef, streamingAllowed],
  );

  const playCurrentInGesture = useCallback(() => {
    if (!streamingAllowed) return false;
    const track = useAudioStore.getState().currentTrack;
    if (!track || !useAudioStore.getState().isPlaying) return false;

    allowMutedWarmRef.current = false;
    setCueWarmActive(false);
    startSilentKeepAlive();
    requestBroadcastWakeLock();

    let target: PlayerSlot | null = null;
    if (slotAIdRef.current === track.id) target = "a";
    else if (slotBIdRef.current === track.id) target = "b";
    if (!target) {
      // Cold assign onto live slot.
      target = liveSlotRef.current;
      if (target === "a") {
        slotAIdRef.current = track.id;
        setSlotAId(track.id);
        lastSrcRef.current.a = youtubeSrc(track.youtubeId);
      } else {
        slotBIdRef.current = track.id;
        setSlotBId(track.id);
        lastSrcRef.current.b = youtubeSrc(track.youtubeId);
      }
      injectYoutubeId(slotRef(target).current, track.youtubeId);
    }

    if (target !== liveSlotRef.current) {
      liveSlotRef.current = target;
      setLiveSlot(target);
    }

    playAudible(slotRef(target).current, volume);
    queueMicrotask(() => {
      syncAllAudio();
      keepStandbyHot();
      playAudible(slotRef(target!).current, volume);
    });
    return true;
  }, [keepStandbyHot, slotRef, streamingAllowed, syncAllAudio, volume]);

  useEffect(() => {
    registerMediaPlayNow(() => playCurrentInGesture());
    return () => registerMediaPlayNow(null);
  }, [playCurrentInGesture]);

  useEffect(() => {
    registerPersistentAdvance((reason) => promoteRef.current(reason));
    return () => registerPersistentAdvance(null);
  }, []);

  // Bind live + standby ids when current/upcoming change — never unmount nodes.
  useEffect(() => {
    if (!currentTrack) {
      slotAIdRef.current = null;
      slotBIdRef.current = null;
      setSlotAId(null);
      setSlotBId(null);
      return;
    }

    const live = liveSlotRef.current;
    const standby = otherSlot(live);
    const liveIdNow = live === "a" ? slotAIdRef.current : slotBIdRef.current;
    const standbyIdNow =
      standby === "a" ? slotAIdRef.current : slotBIdRef.current;

    // Already promoted onto standby for this track — only refresh upcoming.
    if (
      lastPromotedTrackRef.current === currentTrack.id &&
      liveIdNow === currentTrack.id
    ) {
      if (upcomingTrack && standbyIdNow !== upcomingTrack.id) {
        if (standby === "a") {
          slotAIdRef.current = upcomingTrack.id;
          setSlotAId(upcomingTrack.id);
          lastSrcRef.current.a = youtubeSrc(upcomingTrack.youtubeId);
        } else {
          slotBIdRef.current = upcomingTrack.id;
          setSlotBId(upcomingTrack.id);
          lastSrcRef.current.b = youtubeSrc(upcomingTrack.youtubeId);
        }
        queueMicrotask(() => keepStandbyHot());
      }
      return;
    }

    // Fresh load / manual skip: put current on live, upcoming on standby.
    if (lastPromotedTrackRef.current !== currentTrack.id) {
      lastPromotedTrackRef.current = null;
    }

    if (live === "a") {
      slotAIdRef.current = currentTrack.id;
      setSlotAId(currentTrack.id);
      lastSrcRef.current.a = youtubeSrc(currentTrack.youtubeId);
      slotBIdRef.current = upcomingTrack?.id ?? null;
      setSlotBId(upcomingTrack?.id ?? null);
      if (upcomingTrack) {
        lastSrcRef.current.b = youtubeSrc(upcomingTrack.youtubeId);
      }
    } else {
      slotBIdRef.current = currentTrack.id;
      setSlotBId(currentTrack.id);
      lastSrcRef.current.b = youtubeSrc(currentTrack.youtubeId);
      slotAIdRef.current = upcomingTrack?.id ?? null;
      setSlotAId(upcomingTrack?.id ?? null);
      if (upcomingTrack) {
        lastSrcRef.current.a = youtubeSrc(upcomingTrack.youtubeId);
      }
    }

    endingRef.current = false;
    handoffFiredRef.current = false;
    durationRef.current = 0;
    lastTickMediaTimeRef.current = 0;

    queueMicrotask(() => {
      if (useAudioStore.getState().isPlaying) {
        allowMutedWarmRef.current = false;
        setCueWarmActive(false);
        playAudible(
          slotRef(liveSlotRef.current).current,
          useAudioStore.getState().volume,
        );
        keepStandbyHot();
        flushPendingMediaPlay();
      } else if (allowMutedWarmRef.current) {
        playMuted(slotRef(liveSlotRef.current).current);
        keepStandbyHot();
      }
      syncAllAudio();
    });
  }, [
    currentTrack?.id,
    currentTrack?.youtubeId,
    upcomingTrack?.id,
    upcomingTrack?.youtubeId,
    keepStandbyHot,
    slotRef,
    syncAllAudio,
  ]);

  useEffect(() => {
    if (!isPlaying) {
      if (
        allowMutedWarmRef.current &&
        cueWarmActive &&
        streamingAllowed &&
        currentTrack
      ) {
        playMuted(slotRef(liveSlotRef.current).current);
        keepStandbyHot();
        return;
      }
      try {
        playerARef.current?.pause();
        playerBRef.current?.pause();
      } catch {
        // ignore
      }
      syncAllAudio();
      return;
    }
    allowMutedWarmRef.current = false;
    setCueWarmActive(false);
    if (!streamingAllowed) return;
    startSilentKeepAlive();
    requestBroadcastWakeLock();
    syncAllAudio();
    playAudible(
      slotRef(liveSlotRef.current).current,
      useAudioStore.getState().volume,
    );
    keepStandbyHot();
  }, [
    isPlaying,
    streamingAllowed,
    currentTrack,
    cueWarmActive,
    keepStandbyHot,
    slotRef,
    syncAllAudio,
  ]);

  // While playing, periodically re-assert muted standby so background GC
  // cannot leave the next track cold.
  useEffect(() => {
    if (!isPlaying || !streamingAllowed) return;
    const id = window.setInterval(() => {
      startSilentKeepAlive();
      keepStandbyHot();
      const live = slotRef(liveSlotRef.current).current;
      if (live?.paused) {
        playAudible(live, useAudioStore.getState().volume);
      }
    }, STANDBY_REASSERT_MS);
    return () => window.clearInterval(id);
  }, [isPlaying, streamingAllowed, keepStandbyHot, slotRef]);

  useEffect(() => {
    syncAllAudio();
  }, [volume, syncAllAudio]);

  useEffect(() => {
    if (!broadcastEnhance || !isPlaying) return;
    const run = () => {
      syncAllAudio();
      const quality = applyBroadcastQuality(
        slotRef(liveSlotRef.current).current as YoutubePlayerElement | null,
      );
      if (quality) useAudioStore.getState().setStreamQuality(quality);
    };
    run();
    const id = window.setInterval(run, QUALITY_REASSERT_MS);
    return () => window.clearInterval(id);
  }, [broadcastEnhance, isPlaying, slotRef, syncAllAudio, currentTrack?.id]);

  useEffect(() => {
    if (pendingSeekSeconds == null) return;
    const media = slotRef(liveSlotRef.current).current;
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
  }, [seekRequestId, pendingSeekSeconds, slotRef]);

  useEffect(() => {
    if (!streamingAllowed || !currentTrack) return;
    useAudioStore.getState().ensureUpcoming();
  }, [streamingAllowed, currentTrack?.id]);

  const syncQueueHeartbeat = useCallback(
    (playedSec?: number, force = false) => {
      const heartbeat = heartbeatRef.current;
      if (!heartbeat) return;
      const now = performance.now();
      if (!force && now - lastHeartbeatSyncAt.current < 200) return;
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

      heartbeat.sync({
        trackId,
        durationSec,
        playedSec: played,
        isPlaying: state.isPlaying && streamingAllowed && !!trackId,
        handoffSec: isTabHidden() ? HIDDEN_HANDOFF_SEC : EARLY_HANDOFF_SEC,
        prefetchRatio: GAPLESS_PREFETCH_RATIO,
      });

      if (state.isPlaying && trackId && durationSec > 0) {
        armTrackDeadline(played, durationSec, trackId);
      }
    },
    [armTrackDeadline, slotRef, streamingAllowed],
  );

  useEffect(() => {
    const heartbeat = createQueueHeartbeat({
      onAdvance: (trackId) => {
        const state = useAudioStore.getState();
        if (!streamingAllowed) return;
        if (state.newsBulletinActive) return;
        if (state.currentTrack?.id !== trackId) return;
        promoteRef.current("heartbeat");
      },
      onPrefetch: (trackId) => {
        const state = useAudioStore.getState();
        if (state.currentTrack?.id !== trackId) return;
        state.ensureUpcoming();
        keepStandbyHot();
      },
    });
    heartbeatRef.current = heartbeat;
    syncQueueHeartbeat(undefined, true);

    const onVisibility = () => {
      reassertBroadcastWakeLock();
      startSilentKeepAlive();
      syncQueueHeartbeat(undefined, true);
      keepStandbyHot();

      if (document.visibilityState !== "visible") {
        // Entering background: arm an earlier handoff and keep standby hot.
        syncQueueHeartbeat(undefined, true);
        return;
      }
      if (!streamingAllowed) return;

      const state = useAudioStore.getState();
      if (!state.isPlaying) return;

      const deadline = trackDeadlineAtRef.current;
      const deadlineTrack = trackDeadlineIdRef.current;
      if (
        deadline &&
        deadlineTrack === state.currentTrack?.id &&
        Date.now() >= deadline + DEADLINE_OVERDUE_MS
      ) {
        promoteRef.current("visibility-overdue");
        return;
      }

      const media = slotRef(liveSlotRef.current).current;
      const dur = durationRef.current;
      if (
        media &&
        dur > 0 &&
        (media.ended ||
          (Number.isFinite(media.currentTime) &&
            dur - media.currentTime <= HIDDEN_HANDOFF_SEC))
      ) {
        promoteRef.current("visibility");
      } else {
        flushPendingMediaPlay();
        playAudible(media, useAudioStore.getState().volume);
        keepStandbyHot();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      heartbeat.dispose();
      heartbeatRef.current = null;
    };
  }, [keepStandbyHot, slotRef, streamingAllowed, syncQueueHeartbeat]);

  useEffect(() => {
    syncQueueHeartbeat(0, true);
  }, [currentTrack?.id, isPlaying, streamingAllowed, syncQueueHeartbeat]);

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
      onNext: () => promoteRef.current("mediasession-next"),
      onPrevious: () => useAudioStore.getState().previousTrack(),
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const slot of ["a", "b"] as PlayerSlot[]) {
        nativeEndedCleanupsRef.current[slot]?.();
        nativeEndedCleanupsRef.current[slot] = undefined;
      }
    };
  }, []);

  const handleError = useCallback(
    (slot: PlayerSlot) => {
      if (slot !== liveSlotRef.current) {
        // Standby failed — pick a new upcoming and re-warm.
        const id = slot === "a" ? slotAIdRef.current : slotBIdRef.current;
        if (id) useAudioStore.getState().markTrackFailed(id);
        useAudioStore.getState().ensureUpcoming();
        return;
      }
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
      promoteRef.current("error");
    },
    [streamingAllowed],
  );

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
          try {
            media.currentTime = 0;
          } catch {
            // ignore
          }
          playMuted(media);
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
      const handoffLead = isTabHidden() ? HIDDEN_HANDOFF_SEC : EARLY_HANDOFF_SEC;

      if (
        progressRatio >= GAPLESS_PREFETCH_RATIO ||
        remaining <= PREFETCH_WINDOW_SEC
      ) {
        useAudioStore.getState().ensureUpcoming();
        keepStandbyHot();
      }

      // Foreground early handoff near end (Worker covers hidden tabs).
      if (
        dur > 0 &&
        remaining <= handoffLead &&
        !endingRef.current &&
        !handoffFiredRef.current
      ) {
        promoteRef.current("timeupdate-handoff");
        return;
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
    [armTrackDeadline, keepStandbyHot, syncQueueHeartbeat],
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
      }
    },
    [armTrackDeadline, syncQueueHeartbeat],
  );

  const handleReady = useCallback(
    (slot: PlayerSlot) => {
      consecutiveErrors.current = 0;
      attachNativeEnded(slot);
      const isLive = slot === liveSlotRef.current;
      if (isLive && isPlaying) {
        playAudible(slotRef(slot).current, volume);
      } else {
        playMuted(slotRef(slot).current);
      }
      syncSlotAudio(slot);
    },
    [attachNativeEnded, isPlaying, slotRef, syncSlotAudio, volume],
  );

  const handlePause = useCallback(
    (slot: PlayerSlot) => {
      if (!streamingAllowed) return;
      if (!isPlaying) {
        if (allowMutedWarmRef.current) playMuted(slotRef(slot).current);
        return;
      }
      // Browser paused us — immediately resume (muted for standby, audible for live).
      if (slot === liveSlotRef.current) {
        playAudible(slotRef(slot).current, useAudioStore.getState().volume);
      } else {
        playMuted(slotRef(slot).current);
      }
    },
    [isPlaying, slotRef, streamingAllowed],
  );

  const resolveTrack = useCallback(
    (trackId: string | null): Track | null => {
      if (!trackId) return null;
      if (currentTrack?.id === trackId) return currentTrack;
      if (upcomingTrack?.id === trackId) return upcomingTrack;
      return null;
    },
    [currentTrack, upcomingTrack],
  );

  if (!currentTrack && !lastSrcRef.current.a && !lastSrcRef.current.b) {
    return null;
  }

  const renderSlot = (slot: PlayerSlot) => {
    const trackId = slot === "a" ? slotAId : slotBId;
    const track = resolveTrack(trackId);
    if (track) {
      lastSrcRef.current[slot] = youtubeSrc(track.youtubeId);
    }
    const src = track
      ? youtubeSrc(track.youtubeId)
      : lastSrcRef.current[slot];
    if (!src) return null;

    const isLive = slot === liveSlot;
    const ref = slot === "a" ? playerARef : playerBRef;
    const hasTrack = Boolean(track);
    const warming =
      hasTrack &&
      !isPlaying &&
      cueWarmActive &&
      allowMutedWarmRef.current;
    // While radio is live, BOTH slots keep playing=true: live audible, standby
    // muted. Handoff is unmute-only — browsers allow that in background tabs.
    const playingProp =
      streamingAllowed &&
      Boolean(src) &&
      (isPlaying || warming);
    const slotMuted = !isLive || !isPlaying;
    const slotVolume = isLive && isPlaying ? volume : 0;

    return (
      <ReactPlayer
        ref={ref}
        key={`slot-${slot}`}
        src={src}
        playing={playingProp}
        volume={slotVolume}
        muted={slotMuted}
        width={BROADCAST_PLAYER_WIDTH}
        height={BROADCAST_PLAYER_HEIGHT}
        controls={false}
        playsInline
        preload="auto"
        config={{ youtube: YOUTUBE_PLAYER_CONFIG }}
        onReady={() => handleReady(slot)}
        onError={() => handleError(slot)}
        onPlaying={() => {
          if (slot === liveSlotRef.current) consecutiveErrors.current = 0;
          attachNativeEnded(slot);
        }}
        onPause={() => handlePause(slot)}
        onCanPlay={() => {
          attachNativeEnded(slot);
          if (slot === liveSlotRef.current && isPlaying) {
            playAudible(slotRef(slot).current, volume);
            flushPendingMediaPlay();
          } else {
            playMuted(slotRef(slot).current);
          }
        }}
        onTimeUpdate={isLive ? handleTimeUpdate : undefined}
        onDurationChange={isLive ? handleDurationChange : undefined}
        onEnded={
          isLive ? () => promoteRef.current("react-ended") : undefined
        }
      />
    );
  };

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
