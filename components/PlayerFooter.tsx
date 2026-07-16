"use client";

import { formatStreamQualityLabel } from "@/lib/broadcastAudio";
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
  const broadcastEnhance = useAudioStore((s) => s.broadcastEnhance);
  const streamQuality = useAudioStore((s) => s.streamQuality);
  const setBroadcastEnhance = useAudioStore((s) => s.setBroadcastEnhance);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);

  const progress = duration > 0 ? Math.min(1, playedSeconds / duration) : 0;
  const controlsDisabled = !streamingAllowed;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-cyan-500/20 bg-[#0a0614]/95 backdrop-blur-xl">
      <div className="relative h-1 w-full overflow-hidden bg-white/5">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-fuchsia-400 transition-[width] duration-75 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-fuchsia-500/40 via-cyan-400/60 to-transparent ${
            isPlaying && streamingAllowed ? "animate-viz-pulse" : "opacity-40"
          }`}
          style={{
            width: `${Math.max(progress * 100, isPlaying && streamingAllowed ? 8 : 0)}%`,
            boxShadow:
              isPlaying && streamingAllowed
                ? "0 0 16px rgba(34, 211, 238, 0.7), 0 0 32px rgba(217, 70, 239, 0.4)"
                : "none",
          }}
        />
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
        <div className="min-w-0 flex-1">
          {currentTrack ? (
            <>
              <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-white sm:text-base">
                {currentTrack.title}
              </p>
              <p className="truncate text-xs text-cyan-300/70 sm:text-sm">
                {currentTrack.artist}
                <span className="mx-1.5 text-white/20">·</span>
                {currentTrack.year}
                <span className="mx-1.5 text-white/20">·</span>
                {currentTrack.subgenre}
                {broadcastEnhance && streamQuality && (
                  <>
                    <span className="mx-1.5 text-white/20">·</span>
                    <span className="text-fuchsia-300/80">
                      AI HD {formatStreamQualityLabel(streamQuality)}
                    </span>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/80">
                80s Hit Radio
              </p>
              <p className="text-xs text-white/40">
                {controlsDisabled
                  ? "Subscription required to stream"
                  : "Press play to start the broadcast"}
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
        </div>

        <div className="hidden min-w-[9rem] flex-1 items-center justify-end gap-3 sm:flex">
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
