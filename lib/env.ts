/**
 * Env helpers. NEXT_PUBLIC_* must be read with static property access
 * so Next.js can inline them into the client bundle.
 */

function serverRead(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Server-only env read (shared by Stripe pricing helpers). */
export function serverEnv(name: string): string {
  return serverRead(name);
}

const isLocalDev = process.env.NODE_ENV !== "production";

/** True when real-looking Supabase public credentials are present. */
export function isSupabaseConfigured(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) return isLocalDev;
  if (url.includes("placeholder") || url.includes("example.supabase")) {
    return isLocalDev;
  }
  if (anonKey.includes("placeholder")) return isLocalDev;
  return true;
}

/** True when Stripe secret + price are present (server-only keys). */
export function isStripeConfigured(): boolean {
  const secret = serverRead("STRIPE_SECRET_KEY");
  const priceId = serverRead("STRIPE_PRICE_ID");
  if (!secret || !priceId) return isLocalDev;
  if (secret.includes("placeholder") || priceId.includes("placeholder")) {
    return isLocalDev;
  }
  return true;
}

export function isStripeWebhookConfigured(): boolean {
  const secret = serverRead("STRIPE_WEBHOOK_SECRET");
  return isLocalDev || (Boolean(secret) && !secret.includes("placeholder"));
}

export function isLocalDevelopment(): boolean {
  return isLocalDev;
}

export function getSupabaseEnv() {
  return {
    url:
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() ||
      "https://placeholder.supabase.co",
    anonKey:
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder",
  };
}

export function getSupabaseServiceRoleKey() {
  return (
    serverRead("SUPABASE_SERVICE_ROLE_KEY") ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder"
  );
}

export function getStripeSecretKey() {
  return serverRead("STRIPE_SECRET_KEY") || "sk_test_placeholder";
}

/** Default / GBP Stripe Price ID. Prefer getStripePriceIdForCurrency() for checkout. */
export function getStripePriceId() {
  return serverRead("STRIPE_PRICE_ID") || "price_placeholder";
}

export function getStripeWebhookSecret() {
  return serverRead("STRIPE_WEBHOOK_SECRET") || "whsec_placeholder";
}

/** Canonical production origin — never use localhost here. */
export const PRODUCTION_APP_URL = "https://www.rithmgen.co.uk";

function isLocalhostUrl(value: string) {
  return /localhost|127\.0\.0\.1/i.test(value);
}

/**
 * Absolute public site origin used for auth redirects and email assets.
 * On Vercel production/preview, never returns localhost (even if env is wrong).
 */
export function getAppUrl() {
  const onVercel = Boolean(process.env.VERCEL);
  const isProd = process.env.VERCEL_ENV === "production";

  const candidates = [
    serverRead("APP_URL"),
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.replace(/\/$/, "");
    if ((onVercel || isProd) && isLocalhostUrl(normalized)) {
      continue;
    }
    return normalized;
  }

  if (isProd || (onVercel && process.env.VERCEL_ENV !== "development")) {
    if (isProd) return PRODUCTION_APP_URL;
    // Preview: prefer production domain for auth emails over *.vercel.app
    // so confirmation links stay on the real site when Site URL is mis-set.
    if (process.env.VERCEL_ENV === "preview") return PRODUCTION_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}
