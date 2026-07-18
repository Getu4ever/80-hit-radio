"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  MORE_GENRES,
  POPULAR_GENRES,
  type Subgenre,
  type Track,
} from "@/data/tracks";
import { useAudioStore } from "@/store/useAudioStore";
import { useCatalogStore } from "@/store/useCatalogStore";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";
import Header from "@/components/Header";
import Sidebar, { type NavFilter } from "@/components/Sidebar";

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function TrackCard({ track }: { track: Track }) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);
  const [artFailed, setArtFailed] = useState(false);
  const artSrc = track.imageUrl;

  // Reset failure state when the track (or its art URL) changes
  const artKey = `${track.id}:${track.imageUrl}`;
  const [prevArtKey, setPrevArtKey] = useState(artKey);
  if (prevArtKey !== artKey) {
    setPrevArtKey(artKey);
    setArtFailed(false);
  }

  const isActive = currentTrack?.id === track.id;
  const isThisPlaying = isActive && isPlaying && streamingAllowed;

  const handlePlay = () => {
    if (!streamingAllowed) return;
    if (isActive) {
      togglePlay();
    } else {
      playTrack(track);
    }
  };

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white/[0.03] p-4 transition duration-300 hover:bg-white/[0.06] ${
        isActive
          ? "border-cyan-400/50 shadow-[0_0_24px_rgba(34,211,238,0.15)]"
          : "border-white/10 hover:border-fuchsia-400/30"
      }`}
    >
      <div
        className={`relative mb-4 aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-fuchsia-950/80 via-[#1a0a2e] to-cyan-950/60 ${
          isThisPlaying ? "animate-album-glow" : ""
        }`}
      >
        {!artFailed ? (
          <Image
            src={artSrc}
            alt={`${track.artist} — ${track.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
            priority={track.id === "1"}
            unoptimized
            onError={() => setArtFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-white/70">
              {track.artist}
            </p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07040f]/90 via-[#07040f]/20 to-transparent" />
        <span className="absolute bottom-3 left-3 font-[family-name:var(--font-display)] text-sm font-semibold tracking-widest text-cyan-200/90">
          {track.year}
        </span>
        {isThisPlaying && (
          <span className="absolute right-3 top-3 rounded-full bg-fuchsia-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_0_12px_rgba(217,70,239,0.6)]">
            On air
          </span>
        )}
      </div>

      <div className="mb-3 min-w-0">
        <h3 className="truncate font-[family-name:var(--font-display)] text-base font-semibold tracking-wide text-white">
          {track.title}
        </h3>
        <p className="truncate text-sm text-white/50">{track.artist}</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-cyan-400/60">
          {track.subgenre}
        </p>
      </div>

      <button
        type="button"
        onClick={handlePlay}
        disabled={!streamingAllowed}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600/90 to-cyan-500/90 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(217,70,239,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={
          isThisPlaying ? `Pause ${track.title}` : `Play ${track.title}`
        }
      >
        {isThisPlaying ? (
          <PauseIcon className="h-4 w-4" />
        ) : (
          <PlayIcon className="h-4 w-4" />
        )}
        {isThisPlaying ? "Pause" : "Play"}
      </button>
    </article>
  );
}

export default function RadioDashboard() {
  const [filter, setFilter] = useState<NavFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMoreGenres, setShowMoreGenres] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);
  const startRadio = useAudioStore((s) => s.startRadio);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const catalogLoading = useCatalogStore((s) => s.loading);
  const catalogLoaded = useCatalogStore((s) => s.loaded);
  const getTracksBySubgenre = useCatalogStore((s) => s.getTracksBySubgenre);
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);
  const controlsDisabled = !streamingAllowed;

  const genreTracks = useMemo(
    () => getTracksBySubgenre(filter),
    [filter, getTracksBySubgenre, catalogLoaded],
  );

  const visibleTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return genreTracks;
    return genreTracks.filter((track) => {
      const haystack = [
        track.title,
        track.artist,
        String(track.year),
        track.subgenre,
      ]
        .join(" ")
        .toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token));
    });
  }, [genreTracks, searchQuery]);

  const shownTracks = useMemo(
    () => visibleTracks.slice(0, visibleCount),
    [visibleTracks, visibleCount],
  );

  const moreExpanded =
    showMoreGenres || MORE_GENRES.includes(filter as Subgenre);

  const mobileNavItems: NavFilter[] = [
    "All",
    ...POPULAR_GENRES,
    ...(moreExpanded ? MORE_GENRES : []),
  ];

  const handleFilterChange = (next: NavFilter) => {
    if (controlsDisabled) return;
    setFilter(next);
    setVisibleCount(48);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setVisibleCount(48);
  };

  /** All / Live Radio → mainstream pool only; genre filter → that genre. */
  const handleStartRadio = (seed: Track[]) => {
    if (controlsDisabled) return;
    if (filter === "All" && !searchQuery.trim()) {
      startRadio();
    } else {
      startRadio(seed);
    }
  };

  return (
    <div className="flex min-h-screen overflow-x-clip bg-[#07040f] text-white">
      <Sidebar
        filter={filter}
        onFilterChange={handleFilterChange}
        visibleTracks={visibleTracks}
        isPlaying={isPlaying}
        onStartRadio={handleStartRadio}
      />

      <main className="relative flex-1 overflow-x-hidden overflow-y-auto pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
        >
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-[120px]" />
          <div className="absolute -right-20 top-40 h-80 w-80 rounded-full bg-cyan-500/15 blur-[100px]" />
          <div className="absolute bottom-20 left-1/3 h-64 w-64 rounded-full bg-violet-600/10 blur-[90px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
          <Header
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
          />

          <header className="mb-6 animate-fade-up sm:mb-10">
            <p className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-400/70 sm:text-xs sm:tracking-[0.4em]">
              Continuous 80s broadcast
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-fuchsia-200 to-cyan-300">
                80s Hit Radio
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-white/50 sm:text-base">
              Non-stop classic hits streamed live. Pick a track or let the
              radio shuffle the decade for you.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => handleStartRadio(visibleTracks)}
                disabled={controlsDisabled}
                className="rounded-full bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(217,70,239,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start Live Radio
              </button>
              <button
                type="button"
                onClick={() => {
                  handleFilterChange("All");
                  setVisibleCount(48);
                }}
                disabled={controlsDisabled}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/50 transition hover:border-cyan-400/30 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Browse all hits
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
              {mobileNavItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => {
                    if (MORE_GENRES.includes(item as Subgenre)) {
                      setShowMoreGenres(true);
                    }
                    handleFilterChange(item);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    filter === item
                      ? "bg-cyan-400/20 text-cyan-300"
                      : "bg-white/5 text-white/50"
                  }`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowMoreGenres((v) => !v)}
                aria-expanded={moreExpanded}
                disabled={controlsDisabled}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 transition hover:border-cyan-400/30 hover:text-cyan-300/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {moreExpanded ? "Less genres" : "More genres"}
              </button>
            </div>
          </header>

          {currentTrack && (
            <p className="mb-6 animate-fade-up text-sm text-white/40 [animation-delay:80ms]">
              Now on air:{" "}
              <span className="text-cyan-300/90">
                {currentTrack.artist} — {currentTrack.title}
              </span>
            </p>
          )}

          <p className="mb-4 text-xs text-white/35">
            {catalogLoading && !catalogLoaded
              ? "Loading catalog…"
              : searchQuery.trim()
                ? `Found ${visibleTracks.length} match${
                    visibleTracks.length === 1 ? "" : "es"
                  } for “${searchQuery.trim()}”${
                    filter !== "All" ? ` in ${filter}` : ""
                  }`
                : `Showing ${shownTracks.length} of ${visibleTracks.length} tracks${
                    filter !== "All" ? ` in ${filter}` : ""
                  }`}
          </p>

          <div className="grid grid-cols-1 gap-4 animate-fade-up sm:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4 [animation-delay:120ms]">
            {shownTracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>

          {shownTracks.length < visibleTracks.length && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + 48)}
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
              >
                Load more tracks
              </button>
            </div>
          )}

          {visibleTracks.length === 0 && (
            <p className="mt-12 text-center text-white/40">
              {searchQuery.trim()
                ? "No tracks match your search. Try another song, artist, or year."
                : "No tracks in this category yet."}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
