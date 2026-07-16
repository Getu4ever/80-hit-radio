"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioStore } from "@/store/useAudioStore";
import { tracks as staticTracks, SUBGENRES } from "@/data/tracks";

const ANALYTICS_TIMEOUT_MS = 15_000;

type AnalyticsPayload = {
  users: {
    totalUsers: number;
    activeSubscribers: number;
    trialingUsers: number;
    newThisWeek: number;
    conversionRate: number;
  };
  site: {
    concurrentListeners: number;
    playsToday: number;
    skipsToday: number;
    sessionsToday: number;
    topTracks: Array<{
      trackId: string;
      title: string;
      artist: string;
      plays: number;
    }>;
    playsByGenre: Array<{ subgenre: string; plays: number }>;
    signupsLast7Days: number[];
  };
  catalog: {
    totalTracks: number;
    source: "database" | "static";
  };
};

export default function AdminOverview() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const startRadio = useAudioStore((s) => s.startRadio);
  const nextTrack = useAudioStore((s) => s.nextTrack);

  const load = useCallback(async () => {
    const isRefresh = hasDataRef.current;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      ANALYTICS_TIMEOUT_MS,
    );

    try {
      const res = await fetch("/api/admin/analytics", {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) {
        let message = "Failed to load analytics";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // ignore malformed error payloads
        }
        if (res.status === 403) message = "Admin access required";
        if (res.status === 401) message = "Sign in again to refresh stats";
        setError(message);
        return;
      }
      const payload = (await res.json()) as AnalyticsPayload;
      setData(payload);
      hasDataRef.current = true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Stats refresh timed out. Try again.");
      } else {
        setError("Network error while loading analytics");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !data) {
    return <p className="text-sm text-white/50">Loading site analytics…</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-5 py-4">
        <p className="text-sm text-fuchsia-200">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const catalogTracks =
    data.catalog.totalTracks > 0 ? data.catalog.totalTracks : staticTracks.length;

  const subgenreCounts = SUBGENRES.map((subgenre) => ({
    subgenre,
    count: staticTracks.filter((t) => t.subgenre === subgenre).length,
  }));

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Live now",
            value: data.site.concurrentListeners,
            hint: "Active in last 2 minutes",
          },
          {
            label: "Registered users",
            value: data.users.totalUsers,
            hint: `${data.users.newThisWeek} joined this week`,
          },
          {
            label: "Premium live",
            value: data.users.activeSubscribers,
            hint: `${data.users.conversionRate}% conversion`,
          },
          {
            label: "Plays today",
            value: data.site.playsToday,
            hint: `${data.site.skipsToday} skips · ${data.site.sessionsToday} sessions`,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <p className="text-xs uppercase tracking-widest text-white/40">
              {stat.label}
            </p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-white/35">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/70">
                Broadcast booth
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                On-air console
              </h2>
            </div>
            <span
              className={`rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-wider ${
                isPlaying
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/15 bg-white/5 text-white/45"
              }`}
            >
              {isPlaying ? "Live" : "Standby"}
            </span>
          </div>

          <div className="mt-5 rounded-xl border border-white/8 bg-[#0a0614]/70 p-4">
            <p className="text-xs uppercase tracking-widest text-white/35">
              Now spinning
            </p>
            {currentTrack ? (
              <>
                <p className="mt-2 font-[family-name:var(--font-display)] text-lg text-white">
                  {currentTrack.title}
                </p>
                <p className="text-sm text-cyan-200/80">
                  {currentTrack.artist} · {currentTrack.year} ·{" "}
                  {currentTrack.subgenre}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/45">
                Nothing on air. Cue the decade.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startRadio()}
              className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition hover:brightness-110"
            >
              {isPlaying ? "Reshuffle" : "Go live"}
            </button>
            <button
              type="button"
              onClick={() => nextTrack()}
              disabled={!currentTrack}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:opacity-40"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing || loading}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh stats"}
            </button>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-widest text-white/40">
              Catalog · {catalogTracks} masters ({data.catalog.source})
            </p>
            <div className="mt-3 space-y-2">
              {subgenreCounts.map(({ subgenre, count }) => (
                <div key={subgenre} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-white/55">
                    {subgenre}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400"
                      style={{
                        width: `${Math.max(8, (count / catalogTracks) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs tabular-nums text-white/35">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-400/70">
            Last 7 days
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
            Top spins
          </h2>

          {data.site.topTracks.length === 0 ? (
            <p className="mt-5 text-sm text-white/45">
              No play data yet. Spins appear here once listeners tune in.
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {data.site.topTracks.map((track, index) => (
                <li
                  key={track.trackId}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0a0614]/50 px-3 py-2.5"
                >
                  <span className="w-6 text-sm font-semibold text-cyan-300/80">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{track.title}</p>
                    <p className="truncate text-xs text-white/45">
                      {track.artist}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-white/40">
                    {track.plays} plays
                  </span>
                </li>
              ))}
            </ol>
          )}

          {data.site.playsByGenre.length > 0 && (
            <div className="mt-8">
              <p className="text-xs uppercase tracking-widest text-white/40">
                Genre activity
              </p>
              <div className="mt-3 space-y-2">
                {data.site.playsByGenre.map(({ subgenre, plays }) => (
                  <div key={subgenre} className="flex items-center justify-between text-sm">
                    <span className="text-white/60">{subgenre}</span>
                    <span className="text-cyan-300/80">{plays}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
