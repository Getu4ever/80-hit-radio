"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOUNGE_MAX_MESSAGE_LENGTH,
  LOUNGE_POLL_MS,
  LOUNGE_REACTIONS,
  type LoungeReactionEmoji,
} from "@/lib/lounge/shared";
import { useUserSession } from "@/hooks/useUserSession";
import type { Track } from "@/data/tracks";

type LoungeMessage = {
  id: string;
  display_name: string;
  body: string;
  created_at: string;
};

type ReactionCounts = Record<LoungeReactionEmoji, number>;

type LoungePayload = {
  trackId: string;
  messages: LoungeMessage[];
  reactions: ReactionCounts;
  myReactions: LoungeReactionEmoji[];
  canPost: boolean;
  unavailable?: boolean;
};

const EMPTY_REACTIONS: ReactionCounts = {
  "🔥": 0,
  "🕺": 0,
  "💜": 0,
  "✨": 0,
  "🙌": 0,
};

type TrackLoungeProps = {
  track: Track | null;
};

export default function TrackLounge({ track }: TrackLoungeProps) {
  const { isLoggedIn } = useUserSession();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<LoungePayload | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trackId = track?.id ?? null;

  const load = useCallback(async (id: string, soft = false) => {
    try {
      const res = await fetch(`/api/lounge?trackId=${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as LoungePayload;
      setPayload(data);
      if (!soft) setError(null);
    } catch {
      // Keep last good snapshot.
    }
  }, []);

  useEffect(() => {
    if (!trackId) {
      setPayload(null);
      setDraft("");
      setError(null);
      return;
    }
    setDraft("");
    setError(null);
    void load(trackId);
  }, [trackId, load]);

  useEffect(() => {
    if (!trackId) return;
    const id = window.setInterval(() => {
      void load(trackId, true);
    }, open ? LOUNGE_POLL_MS : LOUNGE_POLL_MS * 2);
    return () => window.clearInterval(id);
  }, [trackId, open, load]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, payload?.messages.length, trackId]);

  if (!track) return null;

  const reactions = payload?.reactions ?? EMPTY_REACTIONS;
  const myReactions = new Set(payload?.myReactions ?? []);
  const messages = payload?.messages ?? [];
  const totalReactions = LOUNGE_REACTIONS.reduce(
    (sum, emoji) => sum + (reactions[emoji] ?? 0),
    0,
  );
  const canPost = Boolean(payload?.canPost);
  const unavailable = Boolean(payload?.unavailable);

  const toggleReaction = async (emoji: LoungeReactionEmoji) => {
    if (!isLoggedIn) {
      setError("Sign in to react to this track.");
      setOpen(true);
      return;
    }
    if (!canPost) {
      setError("Start a free trial or Premium to join the lounge.");
      setOpen(true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lounge/react", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, emoji }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update reaction.");
        return;
      }
      await load(track.id, true);
    } catch {
      setError("Could not update reaction.");
    } finally {
      setBusy(false);
    }
  };

  const postMessage = async () => {
    const body = draft.trim();
    if (!body) return;

    if (!isLoggedIn) {
      setError("Sign in to leave a note on this track.");
      return;
    }
    if (!canPost) {
      setError("Start a free trial or Premium to post.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lounge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, message: body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not post.");
        return;
      }
      setDraft("");
      await load(track.id);
    } catch {
      setError("Could not post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="mb-6 animate-fade-up [animation-delay:100ms]"
      aria-label="On this track lounge"
    >
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fuchsia-300/75">
              On this track
            </span>
            <span className="truncate text-sm text-white/55">
              {track.title}
              <span className="text-white/30"> · </span>
              {track.artist}
            </span>
            <span className="shrink-0 text-xs text-white/35">
              {messages.length > 0
                ? `${messages.length} note${messages.length === 1 ? "" : "s"}`
                : totalReactions > 0
                  ? `${totalReactions} vibe${totalReactions === 1 ? "" : "s"}`
                  : "be first"}
            </span>
            <span className="shrink-0 text-white/30" aria-hidden>
              {open ? "▴" : "▾"}
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-1">
            {LOUNGE_REACTIONS.map((emoji) => {
              const count = reactions[emoji] ?? 0;
              const mine = myReactions.has(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleReaction(emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition disabled:opacity-50 ${
                    mine
                      ? "border-cyan-400/40 bg-cyan-400/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                  aria-label={`React ${emoji}`}
                  aria-pressed={mine}
                >
                  <span aria-hidden>{emoji}</span>
                  {count > 0 ? (
                    <span className="text-[11px] tabular-nums text-white/50">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {open ? (
          <div className="mt-3 border-t border-white/8 pt-3">
            {unavailable ? (
              <p className="text-sm text-white/45">
                The live lounge opens once the station enables it. Reactions and
                notes will appear here for everyone listening to this song.
              </p>
            ) : (
              <>
                <div
                  ref={listRef}
                  className="max-h-44 space-y-2.5 overflow-y-auto overscroll-contain pr-1"
                >
                  {messages.length === 0 ? (
                    <p className="text-sm text-white/40">
                      Quiet on this track so far — leave a short line while it
                      plays.
                    </p>
                  ) : (
                    messages.map((item) => (
                      <p key={item.id} className="text-sm leading-snug">
                        <span className="font-medium text-cyan-200/90">
                          {item.display_name}
                        </span>
                        <span className="text-white/25"> · </span>
                        <span className="text-white/70">{item.body}</span>
                      </p>
                    ))
                  )}
                </div>

                {error ? (
                  <p className="mt-3 text-xs text-fuchsia-200/90">{error}</p>
                ) : null}

                {canPost ? (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void postMessage();
                    }}
                  >
                    <label className="sr-only" htmlFor="track-lounge-input">
                      Comment on this track
                    </label>
                    <input
                      id="track-lounge-input"
                      value={draft}
                      maxLength={LOUNGE_MAX_MESSAGE_LENGTH}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="One short line about this song…"
                      disabled={busy}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-400/40"
                    />
                    <button
                      type="submit"
                      disabled={busy || !draft.trim()}
                      className="shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                    >
                      Send
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-white/45">
                    {isLoggedIn ? (
                      <>
                        Subscribe or start a free trial to post.{" "}
                        <Link
                          href="/pricing"
                          className="text-cyan-300 underline-offset-2 hover:underline"
                        >
                          View plans
                        </Link>
                      </>
                    ) : (
                      <>
                        Guests can watch the vibe.{" "}
                        <Link
                          href="/auth/login"
                          className="text-cyan-300 underline-offset-2 hover:underline"
                        >
                          Sign in
                        </Link>{" "}
                        to react or leave a note.
                      </>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
