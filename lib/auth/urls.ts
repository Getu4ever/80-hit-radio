import { getAppUrl } from "@/lib/env";

/** OAuth / email confirmation redirect target (server-safe). */
export function getAuthCallbackUrl(next = "/") {
  const base = getAppUrl();
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
  const base = getAppUrl();
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
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : getAppUrl();
  const nextPath = next.startsWith("/") ? next : "/";
  return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

/** Password reset redirect target in the browser. */
export function getClientPasswordResetUrl() {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : getAppUrl();
  return `${base}/auth/reset-password`;
}
