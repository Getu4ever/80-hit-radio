"use client";

import { useEffect, useState } from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type AdminAnalyticsResponse = {
  users: {
    totalUsers: number;
    activeSubscribers: number;
    trialingUsers: number;
    canceledUsers: number;
    pastDueUsers: number;
    adminUsers: number;
    newThisWeek: number;
    conversionRate: number;
  };
  site: {
    concurrentListeners: number;
    playsToday: number;
    skipsToday: number;
    sessionsToday: number;
    topTracks: Array<{ trackId: string; title: string; artist: string; plays: number }>;
    playsByGenre: Array<{ subgenre: string; plays: number }>;
    signupsLast7Days: number[];
  };
  catalog: {
    totalTracks: number;
    source: string;
  };
};

const SESSION_KEY = "rithmgen-admin-session";

function getSessionId() {
  if (typeof window === "undefined") return "";
  let sessionId = window.localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rithmgen-${Date.now()}`;
    window.localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export default function AdminRealtimeTelemetry() {
  const [metrics, setMetrics] = useState<AdminAnalyticsResponse | null>(null);
  const [liveAudienceCount, setLiveAudienceCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const sessionId = getSessionId();
    const channel = supabase.channel("live-stream");

    async function loadMetrics() {
      try {
        const response = await fetch("/api/admin/analytics", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Unable to load analytics");
        }
        const data = (await response.json()) as AdminAnalyticsResponse;
        setMetrics(data);
      } catch (err) {
        setError("Unable to fetch telemetry. Refresh the page.");
      }
    }

    loadMetrics();
    const refreshInterval = window.setInterval(loadMetrics, 30_000);

    const setCurrentPresenceCount = () => {
      const state = channel.presenceState();
      setLiveAudienceCount(Object.keys(state).length);
    };

    channel.on("presence", { event: "sync" }, () => {
      setCurrentPresenceCount();
    });
    channel.on("presence", { event: "join" }, () => {
      setCurrentPresenceCount();
    });
    channel.on("presence", { event: "leave" }, () => {
      setCurrentPresenceCount();
    });

    channel.subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        setIsConnected(true);
        setCurrentPresenceCount();
        void channel.track({
          session_id: sessionId,
          role: "admin-monitor",
          status: "listening",
        });
      }
    });

    return () => {
      window.clearInterval(refreshInterval);
      void channel.untrack();
      void channel.unsubscribe();
    };
  }, []);

  const activeSubscribers = metrics?.users.activeSubscribers ?? 0;
  const activeTrialUsers = metrics?.users.trialingUsers ?? 0;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_60px_rgba(109,40,217,0.12)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/70">
            Live audience telemetry
          </p>
          <h2 className="mt-2 text-3xl font-[family-name:var(--font-display)] font-semibold text-white">
            Real-time stream health
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/50">
            Monitor live listeners, premium subscribers, and trial users with
            real-time channel updates anchored to Supabase presence.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0a0614]/80 px-4 py-3 text-sm text-white/60">
          <p className="font-semibold text-white">Status</p>
          <p className="mt-1">{isConnected ? "Realtime connected" : "Connecting…"}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-white/10 bg-[#0a0614]/90 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            Live Audience Count
          </p>
          <p className="mt-4 text-5xl font-[family-name:var(--font-display)] font-semibold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
            {liveAudienceCount}
          </p>
          <p className="mt-2 text-sm text-white/50">
            Adjusts instantly as players join or leave the live broadcast.
          </p>
        </article>

        <article className="rounded-3xl border border-white/10 bg-[#0a0614]/90 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            Active premium subscribers
          </p>
          <p className="mt-4 text-5xl font-[family-name:var(--font-display)] font-semibold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
            {activeSubscribers.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-white/50">
            Number of users currently marked with active paid subscriptions.
          </p>
        </article>

        <article className="rounded-3xl border border-white/10 bg-[#0a0614]/90 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            Active trial users
          </p>
          <p className="mt-4 text-5xl font-[family-name:var(--font-display)] font-semibold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
            {activeTrialUsers.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-white/50">
            Users still within the free trial window and eligible to stream.
          </p>
        </article>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
          {error}
        </p>
      )}
    </section>
  );
}
