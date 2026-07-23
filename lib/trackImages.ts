/** Public Supabase Storage path for track artwork (CDN). */
const BUCKET = "rithmgen-assets";

function supabasePublicBase(): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base || base.includes("placeholder") || base.includes("example.supabase")) {
    return null;
  }
  return base;
}

/**
 * Track artwork URL.
 * Prefer Supabase Storage CDN (instant) over the local `/api/track-images` proxy.
 */
export function trackImagePath(youtubeId: string): string {
  const id = encodeURIComponent(youtubeId);
  const base = supabasePublicBase();
  if (base) {
    return `${base}/storage/v1/object/public/${BUCKET}/tracks/${id}.jpg`;
  }
  return `/api/track-images/${id}`;
}

export function isValidYoutubeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}
