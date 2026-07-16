import { getAppUrl } from "@/lib/env";

/** OAuth / email confirmation redirect target (server-safe). */
export function getAuthCallbackUrl(next = "/") {
  const base = getAppUrl();
  const nextPath = next.startsWith("/") ? next : "/";
  return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
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
