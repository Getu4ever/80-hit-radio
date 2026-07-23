"use client";

import { useEffect, useRef } from "react";
import { isClientNewsBulletinEnabled } from "@/lib/broadcastSchedule";
import { useAudioStore } from "@/store/useAudioStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

const NEWS_ENDPOINT = "/api/news";
/** Start downloading the bulletin before music is paused. */
const PREFETCH_LEAD_SEC = 60;

/**
 * Independent HTMLAudioElement for the luxury AI news bulletin.
 * Prefetches ahead of schedule and only pauses YouTube once news audio is
 * actually playing — removes the dead-air gap before the bulletin.
 */
export default function NewsBulletinPlayer() {
  const newsBulletinActive = useAudioStore((s) => s.newsBulletinActive);
  const volume = useAudioStore((s) => s.volume);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef(false);
  const musicPausedForNewsRef = useRef(false);

  // Prefetch /api/news before the bulletin is due so play() is near-instant.
  useEffect(() => {
    if (!isClientNewsBulletinEnabled()) return;

    const maybePrefetch = () => {
      if (!streamingAllowed) return;
      if (useAudioStore.getState().newsBulletinActive) return;
      if (prefetchRef.current) return;

      const state = useAudioStore.getState();
      const elapsed =
        state.musicPlayedSeconds - state.lastBulletinAtMusicSeconds;
      const remaining = state.newsBulletinIntervalSec - elapsed;
      if (remaining > PREFETCH_LEAD_SEC || remaining < -5) return;

      const audio = new Audio();
      audio.preload = "auto";
      audio.src = NEWS_ENDPOINT;
      try {
        audio.load();
      } catch {
        // Best-effort warm.
      }
      prefetchRef.current = audio;
    };

    maybePrefetch();
    const unsub = useAudioStore.subscribe((state, prev) => {
      if (
        state.musicPlayedSeconds === prev.musicPlayedSeconds &&
        state.lastBulletinAtMusicSeconds === prev.lastBulletinAtMusicSeconds &&
        state.newsBulletinActive === prev.newsBulletinActive
      ) {
        return;
      }
      maybePrefetch();
    });
    const id = window.setInterval(maybePrefetch, 5_000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, [streamingAllowed]);

  useEffect(() => {
    if (!newsBulletinActive || !streamingAllowed) return;

    playedRef.current = false;
    musicPausedForNewsRef.current = false;

    const audio = prefetchRef.current ?? new Audio();
    prefetchRef.current = null;
    if (!audio.src) {
      audio.src = NEWS_ENDPOINT;
      audio.preload = "auto";
    }
    audio.volume = Math.min(1, Math.max(0, volume));
    audioRef.current = audio;

    const finish = (skipped: boolean) => {
      if (playedRef.current) return;
      playedRef.current = true;
      audioRef.current = null;
      musicPausedForNewsRef.current = false;
      useAudioStore.getState().completeNewsBulletin({ skipped });
    };

    const pauseMusicNow = () => {
      if (musicPausedForNewsRef.current) return;
      musicPausedForNewsRef.current = true;
      // Pause YouTube only once news is audibly starting — no dead air.
      if (useAudioStore.getState().isPlaying) {
        useAudioStore.setState({ isPlaying: false });
      }
    };

    const onPlaying = () => pauseMusicNow();
    const onEnded = () => finish(false);
    const onError = () => finish(true);

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    const tryPlay = () => {
      void audio.play().then(pauseMusicNow).catch(() => finish(true));
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryPlay();
    } else {
      const onCanPlay = () => {
        audio.removeEventListener("canplay", onCanPlay);
        tryPlay();
      };
      audio.addEventListener("canplay", onCanPlay);
      try {
        audio.load();
      } catch {
        // play() below still attempted via canplay / timeout fallback
      }
      // If cache is warm but events are slow, still attempt play shortly.
      window.setTimeout(() => {
        if (!playedRef.current && audioRef.current === audio) tryPlay();
      }, 400);
    }

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // ignore
      }
      audioRef.current = null;
    };
  }, [newsBulletinActive, streamingAllowed, volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volume));
    }
  }, [volume, newsBulletinActive]);

  return null;
}
