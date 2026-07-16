"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getClientPasswordResetUrl } from "@/lib/auth/urls";
import { isSupabaseConfigured } from "@/lib/env";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!isSupabaseConfigured()) {
      setError(
        "Supabase keys are not configured yet. Add them to .env.local (see GO_LIVE.md).",
      );
      return;
    }

    if (!email.trim()) {
      setError("Enter the email address used for your Rithmgen account.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
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
        "Reset email sent. Please check your inbox for the secure password link.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07040f] px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#0a0614]/90 p-8 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/70">
          Password recovery
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Enter your email and we’ll send a reset link to get you back in fast.
        </p>

        {info && (
          <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            {info}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
            {error}
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-white/70">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Sending reset link…" : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          Remembered your password?{' '}
          <Link href="/auth/login" className="text-cyan-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
