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
  mute?: () => void;
  unMute?: () => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getPlayerState?: () => number;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  /** Swap source on the same iframe — never destroy the player instance. */
  loadVideoById?: (
    id: string | { videoId: string; startSeconds?: number },
  ) => void;
  cueVideoById?: (
    id: string | { videoId: string; startSeconds?: number },
  ) => void;
  /** YouTube ENDED = 0 */
  addEventListener?: (event: string, listener: (data: number) => void) => void;
  removeEventListener?: (event: string, listener: (data: number) => void) => void;
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
 * Force mute/volume on the YouTube iframe API. React `muted` / `volume` props
 * are unreliable on hidden embeds — both slots can become audible without this.
 */
export function syncPlayerAudioState(
  playerEl: YoutubePlayerElement | null,
  { volume, muted }: { volume: number; muted: boolean },
): void {
  if (!playerEl) return;

  // Imperative element props — critical for unmute inside a user gesture before
  // React re-renders `muted` / `volume` on the hidden embed.
  try {
    const media = playerEl as HTMLVideoElement;
    if (typeof media.muted === "boolean") {
      media.muted = muted;
      media.volume = muted ? 0 : Math.min(1, Math.max(0, volume));
    }
  } catch {
    // ignore element sync errors during handoff
  }

  const api = playerEl.api;
  if (!api) return;

  try {
    if (muted) {
      api.mute?.();
      api.setVolume?.(0);
    } else {
      api.unMute?.();
      api.setVolume?.(Math.round(Math.min(1, Math.max(0, volume)) * 100));
    }
  } catch {
    // ignore volume sync errors during handoff
  }
}

/** Select the highest available YouTube playback tier for the live slot. */
export function applyBroadcastQuality(
  playerEl: YoutubePlayerElement | null,
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

  const current = api.getPlaybackQuality?.();
  return (current as YoutubeQuality | undefined) ?? (best as YoutubeQuality | null);
}

/**
 * AI-assisted stream optimizer: selects the highest available YouTube
 * playback tier and normalizes volume for radio-style loudness.
 */
export function applyBroadcastEnhancement(
  playerEl: YoutubePlayerElement | null,
  volume: number,
): YoutubeQuality | null {
  syncPlayerAudioState(playerEl, { volume, muted: false });
  return applyBroadcastQuality(playerEl);
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
