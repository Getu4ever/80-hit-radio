import { getAppUrl, isLocalhostUrl, PRODUCTION_APP_URL } from "@/lib/env";

function normalizeOrigin(value: string) {
  return value.replace(/\/$/, "");
}

/**
 * Browser origin for OAuth / password-reset redirects.
 * Prefer the live page origin; never emit localhost from production builds.
 */
function resolveClientOrigin() {
  if (typeof window !== "undefined") {
    const origin = normalizeOrigin(window.location.origin);
    if (process.env.NODE_ENV === "production" && isLocalhostUrl(origin)) {
      return PRODUCTION_APP_URL;
    }
    return origin;
  }

  const appUrl = normalizeOrigin(getAppUrl());
  if (process.env.NODE_ENV === "production" && isLocalhostUrl(appUrl)) {
    return PRODUCTION_APP_URL;
  }
  return appUrl;
}

/** OAuth / email confirmation redirect target (server-safe). */
export function getAuthCallbackUrl(next = "/") {
  const base = normalizeOrigin(getAppUrl());
  const nextPath = next.startsWith("/") ? next : "/";
  return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

/**
 * Confirmation URL for Resend emails. Uses our /auth/callback + token_hash
 * so the user never hits Supabase's Site URL redirect (often still localhost).
 */
export function getEmailConfirmUrl(options: {
  hashedToken: string;
  type?: string;
  next?: string;
}) {
  const base = normalizeOrigin(getAppUrl());
  const nextPath = (options.next ?? "/").startsWith("/")
    ? (options.next ?? "/")
    : "/";
  const type = options.type || "signup";
  const params = new URLSearchParams({
    token_hash: options.hashedToken,
    type,
    next: nextPath,
  });
  return `${base}/auth/callback?${params.toString()}`;
}

/** OAuth redirect target in the browser (matches current origin + port). */
export function getClientAuthCallbackUrl(next = "/") {
  const base = resolveClientOrigin();
  const nextPath = next.startsWith("/") ? next : "/";
  return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

/** Password reset redirect target in the browser. */
export function getClientPasswordResetUrl() {
  return `${resolveClientOrigin()}/auth/reset-password`;
}
