/**
 * Env helpers. NEXT_PUBLIC_* must be read with static property access
 * so Next.js can inline them into the client bundle.
 */

function serverRead(name: string): string {
  return (process.env[name] ?? "").trim();
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

export function getStripePriceId() {
  return serverRead("STRIPE_PRICE_ID") || "price_placeholder";
}

export function getStripeWebhookSecret() {
  return serverRead("STRIPE_WEBHOOK_SECRET") || "whsec_placeholder";
}

export function getAppUrl() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}
