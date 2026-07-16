"use client";

import Link from "next/link";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

export default function PaywallOverlay() {
  const allowed = useStreamAccessStore((s) => s.allowed);
  const checked = useStreamAccessStore((s) => s.checked);
  const message = useStreamAccessStore((s) => s.message);
  const reason = useStreamAccessStore((s) => s.reason);

  if (!checked || allowed) return null;

  const isAuth = reason === "unauthenticated";
  const isError = reason === "error";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="absolute inset-0 bg-[#07040f]/75 backdrop-blur-md" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-[#0a0614]/95 p-6 shadow-[0_0_40px_rgba(217,70,239,0.35),0_0_60px_rgba(34,211,238,0.15)] sm:p-8">
        <p className="relative text-xs uppercase tracking-[0.35em] text-fuchsia-300/80">
          {isAuth
            ? "Sign in required"
            : isError
              ? "Connection issue"
              : "Trial expired"}
        </p>
        <h2
          id="paywall-title"
          className="relative mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-white sm:text-3xl"
        >
          {isAuth
            ? "Welcome back"
            : isError
              ? "Playback locked"
              : "Keep the neon glowing"}
        </h2>
        <p className="relative mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
          {message ??
            (isAuth
              ? "Email confirmed. Sign in with your password to unlock the radio."
              : "Your free month has expired. Subscribe now to keep rocking the 80s!")}
        </p>

        <div className="relative mt-6 flex flex-col gap-3 sm:flex-row">
          {isAuth ? (
            <>
              <Link
                href="/auth/login"
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(217,70,239,0.45)] transition hover:brightness-110"
              >
                Sign in now
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                Create account
              </Link>
            </>
          ) : isError ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(217,70,239,0.45)] transition hover:brightness-110"
            >
              Retry
            </button>
          ) : (
            <>
              <Link
                href="/pricing"
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(217,70,239,0.45)] transition hover:brightness-110"
              >
                Subscribe now
              </Link>
              <Link
                href="/dashboard/profile"
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                Manage account
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
