/**
 * Client-side broadcast audio helpers.
 * YouTube adaptive streaming picks bitrate partly from player size — a 0×0
 * embed often gets the lowest audio tier. We maximize tier + re-assert on play.
 */

const QUALITY_RANK = [
  "highres",
  "hd1080",
  "hd720",
  "large",
  "medium",
  "small",
  "tiny",
] as const;

export type YoutubeQuality = (typeof QUALITY_RANK)[number];

export interface YoutubePlayerApi {
  getAvailableQualityLevels?: () => string[];
  setPlaybackQuality?: (quality: string) => void;
  getPlaybackQuality?: () => string;
  setVolume?: (volume: number) => void;
  unMute?: () => void;
}

export interface YoutubePlayerElement extends HTMLElement {
  api?: YoutubePlayerApi;
}

/** Pick the highest tier YouTube exposes for this embed. */
export function pickBestQuality(levels: string[]): string | null {
  for (const tier of QUALITY_RANK) {
    if (levels.includes(tier)) return tier;
  }
  return levels[0] ?? null;
}

/**
 * AI-assisted stream optimizer: selects the highest available YouTube
 * playback tier and normalizes volume for radio-style loudness.
 */
export function applyBroadcastEnhancement(
  playerEl: YoutubePlayerElement | null,
  volume: number,
): YoutubeQuality | null {
  const api = playerEl?.api;
  if (!api?.getAvailableQualityLevels || !api?.setPlaybackQuality) {
    return null;
  }

  const levels = api.getAvailableQualityLevels();
  const best = pickBestQuality(levels);
  if (best) {
    try {
      api.setPlaybackQuality(best);
    } catch {
      // Deprecated in some regions — sizing still helps adaptive bitrate.
    }
  }

  try {
    api.unMute?.();
    api.setVolume?.(Math.round(Math.min(1, Math.max(0, volume)) * 100));
  } catch {
    // ignore volume sync errors during handoff
  }

  const current = api.getPlaybackQuality?.();
  return (current as YoutubeQuality | undefined) ?? (best as YoutubeQuality | null);
}

/** Hidden HD viewport — YouTube uses this for adaptive stream selection. */
export const BROADCAST_PLAYER_WIDTH = 1920;
export const BROADCAST_PLAYER_HEIGHT = 1080;

export const YOUTUBE_PLAYER_CONFIG = {
  rel: 0,
  iv_load_policy: 3,
  modestbranding: 1,
  fs: 0,
  disablekb: 1,
  playsinline: 1,
} as const;

/** Human-readable label for the player footer quality badge. */
export function formatStreamQualityLabel(quality: string): string {
  if (quality === "highres") return "4K";
  if (quality === "hd1080") return "1080p";
  if (quality === "hd720") return "720p";
  if (quality === "large") return "480p";
  if (quality === "medium") return "360p";
  if (quality === "small") return "240p";
  if (quality === "tiny") return "144p";
  return quality.toUpperCase();
}
