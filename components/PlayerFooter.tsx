"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatStreamQualityLabel } from "@/lib/broadcastAudio";
import SoundWave from "@/components/SoundWave";
import ShareStation from "@/components/ShareStation";
import { useAudioStore } from "@/store/useAudioStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function IconPrevious({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function IconPause({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function IconNext({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
    </svg>
  );
}

function IconVolume({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function SeekBar({
  progress,
  duration,
  playedSeconds,
  disabled,
  isPlaying,
  streamingAllowed,
  onSeek,
}: {
  progress: number;
  duration: number;
  playedSeconds: number;
  disabled: boolean;
  isPlaying: boolean;
  streamingAllowed: boolean;
  onSeek: (seconds: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [dragRatio, setDragRatio] = useState(0);

  const displayRatio = dragging ? dragRatio : progress;
  const displaySeconds = dragging ? dragRatio * duration : playedSeconds;
  const canSeek = !disabled && duration > 0;

  const ratioFromClientX = useCallback((clientX: number) => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const commitSeek = useCallback(
    (ratio: number) => {
      if (!canSeek) return;
      onSeek(ratio * duration);
    },
    [canSeek, duration, onSeek],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      setDragRatio(ratioFromClientX(event.clientX));
    };

    const onUp = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const ratio = ratioFromClientX(event.clientX);
      draggingRef.current = false;
      setDragging(false);
      setDragRatio(ratio);
      commitSeek(ratio);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, commitSeek, ratioFromClientX]);

  return (
    <div className="group/seek relative">
      <div
        ref={barRef}
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration) || 0}
        aria-valuenow={Math.floor(displaySeconds) || 0}
        aria-valuetext={`${formatTime(displaySeconds)} of ${formatTime(duration)}`}
        aria-disabled={!canSeek}
        className={`relative h-3 w-full cursor-pointer touch-none outline-none ${
          canSeek ? "" : "cursor-not-allowed"
        }`}
        onPointerDown={(event) => {
          if (!canSeek) return;
          event.preventDefault();
          barRef.current?.setPointerCapture?.(event.pointerId);
          const ratio = ratioFromClientX(event.clientX);
          draggingRef.current = true;
          setDragging(true);
          setDragRatio(ratio);
        }}
        onKeyDown={(event) => {
          if (!canSeek) return;
          const step = event.shiftKey ? 10 : 5;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            onSeek(Math.min(duration, playedSeconds + step));
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            onSeek(Math.max(0, playedSeconds - step));
          } else if (event.key === "Home") {
            event.preventDefault();
            onSeek(0);
          } else if (event.key === "End") {
            event.preventDefault();
            onSeek(duration);
          }
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10 transition-[height] group-hover/seek:h-1.5 group-focus-within/seek:h-1.5">
          <div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-fuchsia-400 ${
              dragging ? "" : "transition-[width] duration-75 ease-linear"
            }`}
            style={{ width: `${displayRatio * 100}%` }}
          />
          <div
            className={`absolute inset-y-0 left-0 origin-left bg-gradient-to-r from-fuchsia-500/40 via-cyan-400/60 to-transparent ${
              isPlaying && streamingAllowed && !dragging
                ? "animate-viz-pulse"
                : "opacity-40"
            }`}
            style={{
              width: `${Math.max(
                displayRatio * 100,
                isPlaying && streamingAllowed ? 8 : 0,
              )}%`,
              boxShadow:
                isPlaying && streamingAllowed
                  ? "0 0 16px rgba(34, 211, 238, 0.7), 0 0 32px rgba(217, 70, 239, 0.4)"
                  : "none",
            }}
          />
        </div>
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0a0614] bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.85)] transition-[opacity,transform] ${
            !canSeek
              ? "opacity-0"
              : dragging
                ? "scale-110 opacity-100"
                : "opacity-0 group-hover/seek:opacity-100 group-focus-within/seek:opacity-100"
          }`}
          style={{ left: `${displayRatio * 100}%` }}
        />
      </div>
      {dragging && (
        <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md border border-cyan-400/30 bg-[#0a0614]/95 px-2 py-0.5 text-[10px] tabular-nums text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.25)]">
          {formatTime(displaySeconds)}
        </div>
      )}
    </div>
  );
}

export default function PlayerFooter() {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const volume = useAudioStore((s) => s.volume);
  const playedSeconds = useAudioStore((s) => s.playedSeconds);
  const duration = useAudioStore((s) => s.duration);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const previousTrack = useAudioStore((s) => s.previousTrack);
  const setVolume = useAudioStore((s) => s.setVolume);
  const seekTo = useAudioStore((s) => s.seekTo);
  const broadcastEnhance = useAudioStore((s) => s.broadcastEnhance);
  const streamQuality = useAudioStore((s) => s.streamQuality);
  const setBroadcastEnhance = useAudioStore((s) => s.setBroadcastEnhance);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);

  const progress = duration > 0 ? Math.min(1, playedSeconds / duration) : 0;
  const controlsDisabled = !streamingAllowed;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 overflow-x-clip border-t border-cyan-500/20 bg-[#0a0614]/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl">
      <div className="px-0 pt-1">
        <SeekBar
          progress={progress}
          duration={duration}
          playedSeconds={playedSeconds}
          disabled={controlsDisabled || !currentTrack}
          isPlaying={isPlaying}
          streamingAllowed={streamingAllowed}
          onSeek={seekTo}
        />
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-6 sm:px-6 sm:py-3">
        <div className="min-w-0 flex-1 basis-0">
          {currentTrack ? (
            <>
              <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-white sm:text-base">
                {currentTrack.title}
              </p>
              <p className="truncate text-xs text-cyan-300/70 sm:text-sm">
                {currentTrack.artist}
                <span className="mx-1.5 text-white/20">·</span>
                {currentTrack.year}
                <span className="mx-1.5 hidden text-white/20 min-[400px]:inline">·</span>
                <span className="hidden min-[400px]:inline">{currentTrack.subgenre}</span>
                {broadcastEnhance && streamQuality && (
                  <span className="hidden sm:inline">
                    <span className="mx-1.5 text-white/20">·</span>
                    <span className="text-fuchsia-300/80">
                      AI HD {formatStreamQualityLabel(streamQuality)}
                    </span>
                  </span>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/80">
                80s Hit Radio
              </p>
              <p className="truncate text-xs text-white/40">
                {controlsDisabled
                  ? "Subscription required to stream"
                  : "Press play to start the broadcast"}
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-3">
          <SoundWave
            active={isPlaying && streamingAllowed}
            className="mr-0.5 hidden min-[520px]:flex"
          />
          <button
            type="button"
            onClick={previousTrack}
            disabled={controlsDisabled}
            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/70"
            aria-label="Previous track"
          >
            <IconPrevious className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={controlsDisabled}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-[#0a0614] shadow-[0_0_20px_rgba(34,211,238,0.45)] transition hover:scale-105 hover:shadow-[0_0_28px_rgba(217,70,239,0.55)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying && streamingAllowed ? (
              <IconPause className="h-5 w-5" />
            ) : (
              <IconPlay className="h-5 w-5 translate-x-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={nextTrack}
            disabled={controlsDisabled}
            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/70"
            aria-label="Next track"
          >
            <IconNext className="h-5 w-5" />
          </button>
          <ShareStation
            compact
            variant="on-air"
            track={
              currentTrack
                ? { artist: currentTrack.artist, title: currentTrack.title }
                : null
            }
            className="sm:hidden"
          />
          <SoundWave
            active={isPlaying && streamingAllowed}
            className="ml-0.5 hidden sm:flex"
          />
        </div>

        <div className="hidden min-w-[9rem] flex-1 items-center justify-end gap-3 sm:flex">
          <ShareStation
            compact
            variant="on-air"
            track={
              currentTrack
                ? { artist: currentTrack.artist, title: currentTrack.title }
                : null
            }
          />
          <button
            type="button"
            onClick={() => setBroadcastEnhance(!broadcastEnhance)}
            disabled={controlsDisabled}
            aria-pressed={broadcastEnhance}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-40 ${
              broadcastEnhance
                ? "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200"
                : "border-white/10 bg-white/5 text-white/40"
            }`}
            title="AI-assisted HD stream optimization"
          >
            AI Enhance
          </button>
          <span className="tabular-nums text-xs text-white/40">
            {formatTime(playedSeconds)} / {formatTime(duration)}
          </span>
          <div className="flex items-center gap-2">
            <IconVolume className="h-4 w-4 text-white/50" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              disabled={controlsDisabled}
              className="volume-slider h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
