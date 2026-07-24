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
  broadcastPlayerSize,
  installYoutubeIframeApiPatch,
  patchYoutubeVolumeSafe,
  syncPlayerAudioState,
  YOUTUBE_PLAYER_CONFIG,
  type YoutubePlayerElement,
} from "@/lib/broadcastAudio";
import {
  flushPendingMediaPlay,
  forcePlayMedia,
  registerBroadcastResume,
  registerMediaPlayNow,
  registerPersistentAdvance,
  resumeBroadcastPlayback,
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

const PREFETCH_WINDOW_SEC = 90;
/** Warm the next track from halfway — late prefetch causes cold-load gaps. */
const GAPLESS_PREFETCH_RATIO = 0.55;
/** Promote a bit early so unmute + buffer catch up before the old track ends. */
const EARLY_HANDOFF_SEC = 2.25;
/** Start promote early in hidden tabs — timeupdate/ended often freeze. */
const HIDDEN_HANDOFF_SEC = 10;
const DEADLINE_OVERDUE_MS = 500;
const ERROR_SKIP_COOLDOWN_MS = 800;
const MAX_CONSECUTIVE_ERRORS = 8;
const PROGRESS_UI_INTERVAL_MS = 400;
const MUTED_WARM_LOOP_SEC = 2.5;
const MUTED_WARM_MIN_BUFFER_SEC = 3;
const PLAYBACK_WATCHDOG_MS = 2_000;
/** Force-resume if live media makes no progress for this long. */
const STALL_RESUME_MS = 2_500;
/** Auto-advance if stalled this long near the end (or already ended). */
const STALL_PROMOTE_MS = 6_000;
/** Mid-track "isPlaying but silence" — skip after this many ms without progress. */
const STALL_ZOMBIE_MS = 12_000;
/** Treat as "near end" for stall → promote. */
const NEAR_END_FOR_STALL_SEC = 18;
/** Clear stuck handoff locks so promote can run again. */
const HANDOFF_LOCK_MAX_MS = 5_000;
/** If standby drifts past this while muted, seek back to 0 for instant handoff. */
const STANDBY_MAX_AHEAD_SEC = 3;
/** YouTube iframe API states used by the watchdog. */
const YT_ENDED = 0;
const YT_PAUSED = 2;
const YT_CUED = 5;

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

/** Keep standby near t=0 so promote is unmute-only, not mid-song. */
function resetStandbyToStart(media: HTMLMediaElement | null) {
  if (!media) return;
  const yt = media as YoutubePlayerElement;
  try {
    const t = media.currentTime;
    const ended =
      media.ended ||
      yt.api?.getPlayerState?.() === YT_ENDED;
    if (ended || (Number.isFinite(t) && t > STANDBY_MAX_AHEAD_SEC)) {
      media.currentTime = 0;
      yt.api?.seekTo?.(0, true);
    }
  } catch {
    try {
      yt.api?.seekTo?.(0, true);
    } catch {
      // ignore
    }
  }
}

function playMuted(media: HTMLMediaElement | null) {
  if (!media) return;
  patchYoutubeVolumeSafe(media as YoutubePlayerElement);
  syncPlayerAudioState(media as YoutubePlayerElement, { volume: 0, muted: true });
  forcePlayMedia(media, { preferMuted: true });
}

function playAudible(media: HTMLMediaElement | null, volume: number) {
  if (!media) return;
  patchYoutubeVolumeSafe(media as YoutubePlayerElement);
  syncPlayerAudioState(media as YoutubePlayerElement, {
    volume,
    muted: false,
  });
  forcePlayMedia(media, { preferMuted: false });
}

/**
 * Mute-only silence before the other slot becomes audible.
 * Avoid pauseVideo — pausing drops the continuous media session on mobile
 * WebViews and makes the demoted slot hard to re-warm for song 3+.
 */
function silenceSlot(media: HTMLMediaElement | null) {
  if (!media) return;
  patchYoutubeVolumeSafe(media as YoutubePlayerElement);
  syncPlayerAudioState(media as YoutubePlayerElement, { volume: 0, muted: true });
}

/** Schedule play retries — mobile YouTube often rejects the first unmute. */
function retryAudible(
  getMedia: () => HTMLMediaElement | null,
  delaysMs: number[] = [80, 250, 700],
) {
  for (const delay of delaysMs) {
    window.setTimeout(() => {
      if (!useAudioStore.getState().isPlaying) return;
      playAudible(getMedia(), useAudioStore.getState().volume);
      applyBroadcastQuality(getMedia() as YoutubePlayerElement | null);
    }, delay);
  }
}

function readYtState(media: HTMLMediaElement | null): number | null {
  if (!media) return null;
  try {
    const state = (media as YoutubePlayerElement).api?.getPlayerState?.();
    return typeof state === "number" ? state : null;
  } catch {
    return null;
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
  /** Watchdog: last observed live currentTime + when progress last moved. */
  const watchdogMediaTimeRef = useRef(0);
  const stallSinceRef = useRef(0);
  const handoffLockedAtRef = useRef(0);

  liveSlotRef.current = liveSlot;

  useEffect(() => {
    installYoutubeIframeApiPatch();
  }, []);

  const slotRef = useCallback(
    (slot: PlayerSlot) => (slot === "a" ? playerARef : playerBRef),
    [],
  );

  const bindPlayerRef = useCallback(
    (slot: PlayerSlot) => (node: HTMLVideoElement | null) => {
      const targetRef = slotRef(slot);
      targetRef.current = node;
      patchYoutubeVolumeSafe(node as YoutubePlayerElement | null);
    },
    [slotRef],
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
    const ytState = readYtState(media);
    // Ended / cued / paused standby cannot be promoted — force a muted restart.
    if (
      media.ended ||
      media.paused ||
      ytState === YT_ENDED ||
      ytState === YT_PAUSED ||
      ytState === YT_CUED
    ) {
      try {
        media.currentTime = 0;
        (media as YoutubePlayerElement).api?.seekTo?.(0, true);
      } catch {
        // ignore
      }
    } else {
      resetStandbyToStart(media);
    }
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

  const clearHandoffLock = useCallback(() => {
    endingRef.current = false;
    handoffFiredRef.current = false;
    handoffLockedAtRef.current = 0;
  }, []);

  const lockHandoff = useCallback(() => {
    endingRef.current = true;
    handoffFiredRef.current = true;
    handoffLockedAtRef.current = Date.now();
  }, []);

  /**
   * Promote the already-playing standby → live. This is the ONLY safe way to
   * advance YouTube in a background tab (unmute, never cold-start).
   */
  const promoteStandby = useCallback(
    (reason: string) => {
      if (!streamingAllowed) return;
      if (endingRef.current || handoffFiredRef.current) {
        // A prior handoff may have died mid-flight and left the lock stuck —
        // allow watchdog / retries after the grace window.
        const lockedAt = handoffLockedAtRef.current;
        if (
          lockedAt &&
          Date.now() - lockedAt > HANDOFF_LOCK_MAX_MS
        ) {
          clearHandoffLock();
        } else {
          if (!lockedAt) handoffLockedAtRef.current = Date.now();
          return;
        }
      }

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
        lockHandoff();
        state.nextTrack({ skipNewsCheck: false });
        clearHandoffLock();
        return;
      }

      state.ensureUpcoming();
      const next =
        useAudioStore.getState().upcomingTrack ??
        useAudioStore.getState().queue[0] ??
        null;
      if (!next) {
        lockHandoff();
        useAudioStore.getState().nextTrack({
          skipNewsCheck: true,
          skipMediaPlay: false,
        });
        clearHandoffLock();
        return;
      }

      lockHandoff();
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

      try {
        if (canPromote) {
          liveSlotRef.current = standby;
          setLiveSlot(standby);
          lastPromotedTrackRef.current = next.id;

          // Silence old live FIRST so both slots never play aloud together.
          silenceSlot(liveMedia);

          // Snap standby to the start (it may have been looping the warm head).
          resetStandbyToStart(standbyMedia);
          playAudible(standbyMedia, useAudioStore.getState().volume);
          applyBroadcastQuality(standbyMedia as YoutubePlayerElement);

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
            resetStandbyToStart(slotRef(demoted).current);
            playAudible(slotRef(standby).current, useAudioStore.getState().volume);
            syncSlotAudio(standby);
            syncSlotAudio(demoted);
            retryAudible(() => slotRef(liveSlotRef.current).current);
          });
        } else {
          // Standby not ready — load next onto current live node as last resort,
          // but keep keep-alive running and aggressively retry play.
          lastPromotedTrackRef.current = next.id;
          silenceSlot(standbyMedia);
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
            resetStandbyToStart(slotRef(demoted).current);
            playAudible(slotRef(live).current, useAudioStore.getState().volume);
            retryAudible(() => slotRef(liveSlotRef.current).current);
            syncAllAudio();
          });
        }
      } finally {
        durationRef.current = 0;
        lastTickMediaTimeRef.current = 0;
        watchdogMediaTimeRef.current = 0;
        stallSinceRef.current = 0;
        consecutiveErrors.current = 0;
        clearHandoffLock();
      }
    },
    [
      clearHandoffLock,
      lockHandoff,
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
        if (slot !== liveSlotRef.current) {
          // Standby drained while muted — snap back so promote stays unmute-only.
          if (useAudioStore.getState().isPlaying || allowMutedWarmRef.current) {
            const media = slotRef(slot).current;
            try {
              if (media) media.currentTime = 0;
              (media as YoutubePlayerElement | null)?.api?.seekTo?.(0, true);
            } catch {
              // ignore
            }
            playMuted(media);
          }
          return;
        }
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

  // Capacitor / visibility resume — reassert keep-alive + live/standby play.
  useEffect(() => {
    const onResume = () => {
      if (!streamingAllowed) return;
      startSilentKeepAlive();
      requestBroadcastWakeLock();
      reassertBroadcastWakeLock();

      const state = useAudioStore.getState();
      if (!state.isPlaying) return;

      // Clear a stuck handoff lock so promote can run after long background.
      if (endingRef.current || handoffFiredRef.current) {
        const lockedAt = handoffLockedAtRef.current;
        if (!lockedAt || Date.now() - lockedAt > HANDOFF_LOCK_MAX_MS) {
          clearHandoffLock();
        }
      }

      const deadline = trackDeadlineAtRef.current;
      const deadlineTrack = trackDeadlineIdRef.current;
      if (
        deadline &&
        deadlineTrack === state.currentTrack?.id &&
        Date.now() >= deadline + DEADLINE_OVERDUE_MS
      ) {
        promoteRef.current("resume-overdue");
        return;
      }

      const media = slotRef(liveSlotRef.current).current;
      const dur = durationRef.current;
      const ytState = readYtState(media);
      if (
        media &&
        (media.ended ||
          ytState === YT_ENDED ||
          (dur > 0 &&
            Number.isFinite(media.currentTime) &&
            dur - media.currentTime <= HIDDEN_HANDOFF_SEC))
      ) {
        promoteRef.current("resume-ended");
        return;
      }

      flushPendingMediaPlay();
      playAudible(media, useAudioStore.getState().volume);
      retryAudible(() => slotRef(liveSlotRef.current).current, [120, 400]);
      keepStandbyHot();
      syncAllAudio();
    };

    registerBroadcastResume(onResume);
    return () => registerBroadcastResume(null);
  }, [
    clearHandoffLock,
    keepStandbyHot,
    slotRef,
    streamingAllowed,
    syncAllAudio,
  ]);

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
        queueMicrotask(() => {
          injectYoutubeId(slotRef(standby).current, upcomingTrack.youtubeId);
          keepStandbyHot();
        });
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
    useAudioStore.getState().ensureUpcoming();
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

  // Playback watchdog: keep standby warm AND recover "zombie play"
  // (isPlaying true, YouTube silent / ended / frozen) without waiting for a tap.
  useEffect(() => {
    if (!isPlaying || !streamingAllowed) {
      stallSinceRef.current = 0;
      watchdogMediaTimeRef.current = 0;
      return;
    }
    const id = window.setInterval(() => {
      const state = useAudioStore.getState();
      if (!state.isPlaying || !streamingAllowed) return;
      if (state.newsBulletinActive) {
        stallSinceRef.current = 0;
        return;
      }

      startSilentKeepAlive();
      keepStandbyHot();

      // Unlock a handoff that never finished (prevents permanent silence).
      if (endingRef.current || handoffFiredRef.current) {
        const lockedAt = handoffLockedAtRef.current || Date.now();
        handoffLockedAtRef.current = lockedAt;
        if (Date.now() - lockedAt > HANDOFF_LOCK_MAX_MS) {
          clearHandoffLock();
        } else {
          return;
        }
      }

      const live = slotRef(liveSlotRef.current).current;
      if (!live) return;

      const now = Date.now();
      const t = Number.isFinite(live.currentTime) ? live.currentTime : 0;
      const ytState = readYtState(live);
      const dur =
        durationRef.current > 0
          ? durationRef.current
          : Number.isFinite(live.duration) && live.duration > 0
            ? live.duration
            : state.duration > 0
              ? state.duration
              : 0;
      const prevT = watchdogMediaTimeRef.current;
      const progressed =
        prevT === 0 || Math.abs(t - prevT) >= 0.12 || t < prevT - 0.5;

      if (progressed && ytState !== YT_ENDED && ytState !== YT_PAUSED) {
        watchdogMediaTimeRef.current = t;
        stallSinceRef.current = now;
      } else if (!stallSinceRef.current) {
        stallSinceRef.current = now;
      }

      const stalledFor = stallSinceRef.current
        ? now - stallSinceRef.current
        : 0;
      const nearEnd = dur > 0 && dur - t <= NEAR_END_FOR_STALL_SEC;
      const ended =
        live.ended ||
        ytState === YT_ENDED ||
        (dur > 0 && Number.isFinite(t) && t >= dur - 0.35);

      if (ended) {
        promoteRef.current("watchdog-ended");
        stallSinceRef.current = 0;
        return;
      }

      if (
        live.paused ||
        ytState === YT_PAUSED ||
        ytState === YT_CUED ||
        stalledFor >= STALL_RESUME_MS
      ) {
        playAudible(live, useAudioStore.getState().volume);
        // Re-assert unmute in case the iframe stayed muted after promote.
        syncPlayerAudioState(live as YoutubePlayerElement, {
          volume: useAudioStore.getState().volume,
          muted: false,
        });
      }

      // Stuck at end (or never leaving the last seconds) → advance.
      if (stalledFor >= STALL_PROMOTE_MS && nearEnd) {
        promoteRef.current("watchdog-stall");
        stallSinceRef.current = 0;
        return;
      }

      // Stuck at the start after a cold handoff — force play, then advance.
      if (stalledFor >= STALL_PROMOTE_MS + 2_000 && t < 1.5) {
        promoteRef.current("watchdog-start-stall");
        stallSinceRef.current = 0;
        return;
      }

      // Mid-track zombie: isPlaying true, no progress despite resume attempts.
      if (stalledFor >= STALL_ZOMBIE_MS && t >= 1.5 && !nearEnd) {
        promoteRef.current("watchdog-zombie");
        stallSinceRef.current = 0;
      }
    }, PLAYBACK_WATCHDOG_MS);
    return () => window.clearInterval(id);
  }, [
    clearHandoffLock,
    isPlaying,
    keepStandbyHot,
    slotRef,
    streamingAllowed,
  ]);

  useEffect(() => {
    syncAllAudio();
  }, [volume, syncAllAudio]);

  useEffect(() => {
    if (!broadcastEnhance || !isPlaying) return;
    // Set quality once per live track — periodic setPlaybackQuality causes crackle.
    const id = window.setTimeout(() => {
      const quality = applyBroadcastQuality(
        slotRef(liveSlotRef.current).current as YoutubePlayerElement | null,
      );
      if (quality) useAudioStore.getState().setStreamQuality(quality);
    }, 800);
    return () => window.clearTimeout(id);
  }, [broadcastEnhance, isPlaying, slotRef, currentTrack?.id]);

  useEffect(() => {
    stallSinceRef.current = 0;
    watchdogMediaTimeRef.current = 0;
  }, [currentTrack?.id]);

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
      // Foreground / pageshow — full resume path (also used by Capacitor).
      resumeBroadcastPlayback();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    document.addEventListener("resume", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      document.removeEventListener("resume", onVisibility);
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
      patchYoutubeVolumeSafe(
        slotRef(slot).current as YoutubePlayerElement | null,
      );
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

  const playerSize = broadcastPlayerSize();

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
    // Volume is synced imperatively — react-player's volume prop triggers
    // youtube-video-element getVolume() before the iframe API is ready.

    return (
      <ReactPlayer
        ref={bindPlayerRef(slot)}
        key={`slot-${slot}`}
        src={src}
        playing={playingProp}
        muted={slotMuted}
        width={playerSize.width}
        height={playerSize.height}
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
          width: playerSize.width,
          height: playerSize.height,
        }}
      >
        {renderSlot("a")}
        {renderSlot("b")}
      </div>
    </div>
  );
}
