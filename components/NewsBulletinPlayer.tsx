"use client";

import { useEffect, useRef } from "react";
import { CLIENT_NEWS_INTERVAL_SEC } from "@/lib/broadcastSchedule";
import { useAudioStore } from "@/store/useAudioStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

const NEWS_ENDPOINT = "/api/news";

/**
 * Independent HTMLAudioElement for the hourly luxury AI news bulletin.
 * Mounts in BroadcastShell — does not touch the dual-slot YouTube engine.
 */
export default function NewsBulletinPlayer() {
  const newsBulletinActive = useAudioStore((s) => s.newsBulletinActive);
  const volume = useAudioStore((s) => s.volume);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef(false);

  useEffect(() => {
    if (!newsBulletinActive || !streamingAllowed) return;

    playedRef.current = false;
    const audio = new Audio(NEWS_ENDPOINT);
    audio.preload = "auto";
    audio.volume = Math.min(1, Math.max(0, volume));
    audioRef.current = audio;

    const finish = (skipped: boolean) => {
      if (playedRef.current) return;
      playedRef.current = true;
      audioRef.current = null;
      useAudioStore.getState().completeNewsBulletin({ skipped });
    };

    const onEnded = () => finish(false);
    const onError = () => finish(true);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    void audio.play().catch(() => finish(true));

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
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
