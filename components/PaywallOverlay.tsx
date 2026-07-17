"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";

/** Auth / checkout flows must stay usable even when streaming is locked. */
function shouldSuppressPaywall(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/pricing")
  );
}

export default function PaywallOverlay() {
  const pathname = usePathname();
  const allowed = useStreamAccessStore((s) => s.allowed);
  const checked = useStreamAccessStore((s) => s.checked);
  const message = useStreamAccessStore((s) => s.message);
  const reason = useStreamAccessStore((s) => s.reason);

  const suppress = shouldSuppressPaywall(pathname);
  const locked = checked && !allowed && !suppress;

  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);

  if (!locked) return null;

  const isAuth = reason === "unauthenticated";
  const isError = reason === "error";
  const isGuestLimit = reason === "guest_limit";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div
        className="absolute inset-0 bg-[#07040f]/80 backdrop-blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden
      >
        <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-fuchsia-600/30 blur-[100px]" />
        <div className="absolute -right-16 bottom-1/4 h-80 w-80 rounded-full bg-cyan-500/25 blur-[110px]" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[90px]" />
      </div>

      <div
        className={`relative w-full overflow-hidden rounded-2xl border bg-[#0a0614]/95 shadow-[0_0_50px_rgba(217,70,239,0.35),0_0_80px_rgba(34,211,238,0.18)] ${
          isGuestLimit
            ? "max-w-2xl border-cyan-400/35 p-7 sm:p-10"
            : "max-w-lg border-fuchsia-500/40 p-6 sm:p-8"
        }`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent"
          aria-hidden
        />

        {isGuestLimit && (
          <div className="mb-6 w-full max-w-[220px]">
            <BrandLogo size="sm" href={null} />
          </div>
        )}

        <p className="relative text-xs uppercase tracking-[0.35em] text-fuchsia-300/80">
          {isGuestLimit
            ? "Start your free trial"
            : isAuth
              ? "Sign in required"
              : isError
                ? "Connection issue"
                : "Trial expired"}
        </p>
        <h2
          id="paywall-title"
          className="relative mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-white sm:text-3xl"
        >
          {isGuestLimit
            ? "Continue with a 14-day free Premium trial"
            : isAuth
              ? "Welcome back"
              : isError
                ? "Playback locked"
                : "Keep the neon glowing"}
        </h2>
        <p className="relative mt-4 text-sm leading-relaxed text-white/70 sm:text-[15px] sm:leading-7">
          {message ??
            (isAuth
              ? "Email confirmed. Sign in with your password to unlock the radio."
              : "Your free trial has expired. Subscribe now to keep rocking the 80s!")}
        </p>

        <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
          {isGuestLimit ? (
            <Link
              href="/auth/signup"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-6 py-3.5 text-sm font-semibold tracking-wide text-white shadow-[0_0_28px_rgba(217,70,239,0.5),0_0_40px_rgba(34,211,238,0.25)] transition hover:brightness-110"
            >
              Start free trial
            </Link>
          ) : isAuth ? (
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
