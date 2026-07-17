/** Same-origin API path for DB-backed track artwork (no external image URLs). */
export function trackImagePath(youtubeId: string): string {
  return `/api/track-images/${encodeURIComponent(youtubeId)}`;
}

export function isValidYoutubeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}
