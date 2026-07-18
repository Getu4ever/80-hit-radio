"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { getClientAuthCallbackUrl } from "@/lib/auth/urls";
import { isSupabaseConfigured, isLocalDevelopment } from "@/lib/env";
import BrandLogo from "@/components/BrandLogo";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [localDevelopment, setLocalDevelopment] = useState(false);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
    setLocalDevelopment(isLocalDevelopment());
    setReady(true);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      setError(
        "Supabase keys are not configured yet. Add them to .env.local (see GO_LIVE.md).",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        setError(payload.error ?? "Failed to create account.");
        return;
      }

      if (localDevelopment) {
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const loginPayload = await loginResponse.json();
        if (!loginResponse.ok || loginPayload.error) {
          setError(loginPayload.error ?? "Local login failed after signup.");
          return;
        }

        window.location.assign("/");
        return;
      }

      setInfo(
        "A confirmation email has been sent. Check your inbox and click the activation link. Need help? support@rithmgen.co.uk",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07040f] px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-fuchsia-400/20 bg-[#0a0614]/90 p-8 shadow-[0_0_40px_rgba(217,70,239,0.12)]">
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/40 px-3 py-3">
          <BrandLogo size="lg" href="/" />
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-cyan-300/90">
            80s Hit Radio
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-400/70">
          Free trial
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
          Create account
        </h1>
        <p className="mt-2 text-sm text-white/50">
          14 days of unlimited 80s hits — no card required to start.
        </p>

        {ready && !configured && (
          <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            Local mode: add Supabase keys to <code>.env.local</code> to enable
            signup.
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-white/70">
            Full name
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-fuchsia-400/50"
              autoComplete="name"
              placeholder="How you appear in the Listener Lounge"
            />
          </label>
          <label className="block text-sm text-white/70">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-fuchsia-400/50"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm text-white/70">
            Password
            <div className="relative mt-1.5">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-white outline-none focus:border-fuchsia-400/50"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-white/70 transition hover:text-white"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19.5c-5.5 0-10-4-11-9 1-5 5.5-9 11-9 2.67 0 5.15.92 7.14 2.46" />
                    <path d="M1 1l22 22" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {error && (
            <p className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              {info}
            </p>
          )}

          <button
          type="submit"
          disabled={loading || (ready && !configured)}
          className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Creating…" : "Start free trial"}
        </button>
      </form>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-center text-xs uppercase tracking-[0.35em] text-white/40">
          or keep it simple
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!isSupabaseConfigured()) {
              setError(
                "Supabase keys are not configured yet. Add them to .env.local (see GO_LIVE.md).",
              );
              return;
            }
            setLoading(true);
            setError(null);
            setInfo(null);
            try {
              const supabase = createClient();
              const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: getClientAuthCallbackUrl("/"),
                  skipBrowserRedirect: true,
                },
              });

              if (oauthError) {
                setError(oauthError.message);
                return;
              }

              if (data?.url) {
                window.location.assign(data.url);
              } else {
                setError("Google sign-in could not be initialized.");
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading || (ready && !configured)}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#09070f]/90 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/5 disabled:opacity-60"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="h-4 w-4"
            >
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.1 4-4.2 7.4-8.3 9.1v7.6h13.4c7.8-7.2 12.3-18.1 12.3-30.7 0-2.1-.2-4.1-.6-6.1z" />
              <path fill="#FF3D00" d="M6.3 14.7l7.4 5.4C15 16.4 19.6 13 24 13c4 0 7.6 1.5 10.4 4l7.3-7.3C35.9 5.1 30.4 2 24 2 14.8 2 6.9 7.7 3.1 15.9z" />
              <path fill="#4CAF50" d="M24 46c6.5 0 12-2.1 16.1-5.7l-7.6-6.2c-2.4 1.6-5.3 2.6-8.5 2.6-6.2 0-11.4-4.2-13.3-10l-7.7 5.9C8.8 40.6 15.8 46 24 46z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1-3.1-3-5.7-5.7-7.4V13h-.1c-3 0-5.7 1.1-7.8 2.9l-7.4-5.4C14.2 9.8 18.8 7 24 7c5.1 0 9.6 1.9 13.1 5.1z" />
            </svg>
          </span>
          Continue with Google
        </button>

        <p className="mt-4 text-center text-sm text-white/40">
          Sign up with Google and launch your station instantly.
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-white/40">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-cyan-300 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
    </div>
  );
}
