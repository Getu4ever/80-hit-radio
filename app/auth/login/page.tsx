"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getClientAuthCallbackUrl,
  getClientPasswordResetUrl,
} from "@/lib/auth/urls";
import { isSupabaseConfigured, isLocalDevelopment } from "@/lib/env";
import BrandLogo from "@/components/BrandLogo";

function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [authError, setAuthError] = useState<string | null>(null);
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

    const params = new URLSearchParams(window.location.search);
    const confirmed = params.get("confirmed");
    const errorParam = params.get("error");
    const errorDescription = params.get("error_description");

    if (errorDescription || errorParam) {
      setError(errorDescription ?? errorParam);
    } else if (confirmed === "1") {
      setInfo("Email confirmed. Sign in to start streaming.");
    }

    const shouldCleanUrl = ["error", "error_description", "code", "state"].some(
      (key) => params.has(key),
    );

    if (shouldCleanUrl) {
      ["error", "error_description", "code", "state"].forEach((key) => params.delete(key));
      const cleanedUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanedUrl);
    }
  }, []);

  const resetForm = () => {
    setMode("signin");
    setIsSignUp(true);
    setAuthError(null);
    setError(null);
    setInfo(null);
    setPassword("");
    setShowPassword(false);
  };

  const switchToSignUp = () => {
    setIsSignUp(true);
    setMode("signin");
    setAuthError(null);
    setError(null);
    setInfo(null);
    setPassword("");
    setShowPassword(false);
  };

  const switchToSignIn = () => {
    setIsSignUp(false);
    setMode("signin");
    setAuthError(null);
    setError(null);
    setInfo(null);
    setPassword("");
    setShowPassword(false);
  };

  const switchToReset = () => {
    setMode("reset");
    setAuthError(null);
    setError(null);
    setInfo(null);
    setPassword("");
    setShowPassword(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isSupabaseConfigured()) {
      setError(
        "Supabase keys are not configured yet. Add them to .env.local (see GO_LIVE.md).",
      );
      return;
    }

    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }

    if (mode !== "reset" && isSignUp && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setAuthError(null);
    setError(null);
    setInfo(null);

    try {
      if (mode === "reset") {
        const supabase = createClient();
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: getClientPasswordResetUrl(),
          },
        );

        if (resetError) {
          setError(resetError.message);
          return;
        }

        setInfo(
          "Reset link sent. Check your email and follow the instructions to update your password.",
        );
        return;
      }

      if (isSignUp) {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const payload = await response.json();
        if (!response.ok || payload.error) {
          setAuthError(payload.error ?? "Failed to create account.");
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
            setAuthError(loginPayload.error ?? "Local login failed after signup.");
            return;
          }

          window.location.assign("/");
          return;
        }

        setInfo(
          "A confirmation email has been sent. Check your inbox to activate your Rithmgen account.",
        );
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        setAuthError(result.error ?? "Sign in failed.");
        return;
      }

      window.location.assign("/");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
        return;
      }

      setError("Google sign-in could not be initialized.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "reset"
      ? "Reset password"
      : isSignUp
      ? "Create your account"
      : "Welcome back";

  const description =
    mode === "reset"
      ? "Enter your email and we’ll send a secure reset link."
      : isSignUp
      ? "Sign up once and start streaming 80s hits instantly."
      : "Use the same email and password to return to the station.";

  const submitLabel =
    mode === "reset"
      ? "Send reset link"
      : isSignUp
      ? "Start free trial"
      : "Sign in & play";

  const disableAuth = loading || (ready && !configured);

  return (
    <div className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#0a0614]/90 p-8 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <div className="mb-4 rounded-2xl border border-white/10 bg-black/40 px-3 py-3">
        <BrandLogo size="lg" href="/" />
        <p className="mt-1 text-xs uppercase tracking-[0.28em] text-cyan-300/90">
          80s Hit Radio
        </p>
      </div>

      <div className="mb-6 flex overflow-hidden rounded-full border border-white/10 bg-white/5 text-sm text-white/70">
        <button
          type="button"
          className={`flex-1 rounded-full py-2 transition ${
            isSignUp ? "bg-cyan-400/15 text-white" : "text-white/60 hover:text-white"
          }`}
          onClick={switchToSignUp}
        >
          Sign Up
        </button>
        <button
          type="button"
          className={`flex-1 rounded-full py-2 transition ${
            !isSignUp ? "bg-cyan-400/15 text-white" : "text-white/60 hover:text-white"
          }`}
          onClick={switchToSignIn}
        >
          Sign In
        </button>
      </div>

      <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/70">
        {mode === "reset"
          ? "Trouble signing in?"
          : isSignUp
          ? "Create your account"
          : "Welcome back"}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
        {title}
      </h1>
      <p className="mt-2 text-sm text-white/50">{description}</p>

      {ready && !configured && (
        <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          Local mode: add Supabase keys to <code>.env.local</code> to enable auth.
        </p>
      )}

      {info && (
        <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          {info}
        </p>
      )}

      {authError && (
        <p className="mt-4 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
          {authError}
        </p>
      )}

      {error && !authError && (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block text-sm text-white/70">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
            autoComplete="email"
          />
        </label>

        {mode !== "reset" && (
          <label className="block text-sm text-white/70">
            Password
            <div className="relative mt-1.5">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-white outline-none focus:border-cyan-400/50"
                autoComplete={isSignUp ? "new-password" : "current-password"}
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
        )}

        <button
          type="submit"
          disabled={disableAuth}
          className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Processing…" : submitLabel}
        </button>
      </form>

      {mode !== "reset" && (
        <div className="mt-4 space-y-3">
          <div className="border-t border-white/10 pt-4">
            <p className="text-center text-xs uppercase tracking-[0.35em] text-white/40">
              or continue with
            </p>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={disableAuth}
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
              {isSignUp
                ? "Sign up with Google and launch your station instantly."
                : "Use Google to get back to the airwaves faster."}
            </p>
          </div>
        </div>
      )}

      {mode === "signin" && !isSignUp && (
        <div className="mt-4 text-right text-sm">
          <button
            type="button"
            className="text-cyan-300 hover:underline"
            onClick={switchToReset}
          >
            Forgot password?
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-white/40">
        <button
          type="button"
          className="text-cyan-300 hover:underline"
          onClick={isSignUp ? switchToSignIn : switchToSignUp}
        >
          {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Start Free Trial"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07040f] px-4 text-white">
      <Suspense
        fallback={<p className="text-sm text-white/50">Loading auth…</p>}
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
