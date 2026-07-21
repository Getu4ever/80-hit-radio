/**
 * Client-side broadcast audio helpers.
 * Prefer stable mid/high tiers — chasing 4K/1080p mid-stream causes rebuffer
 * crackle on audio-only radio embeds.
 */

/** Prefer stable tiers for radio (audio quality plateaus; avoid 4K thrash). */
const QUALITY_RANK = [
  "hd720",
  "large",
  "medium",
  "small",
  "tiny",
] as const;

export type YoutubeQuality = (typeof QUALITY_RANK)[number];

export interface YoutubePlayerApi {
  getVolume?: () => number;
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

const YOUTUBE_VOLUME_PATCHED = new WeakSet<object>();
const YOUTUBE_API_PATCHED = new WeakSet<object>();
let youtubeIframeApiHookInstalled = false;
let youtubeIframeApiPatchApplied = false;

function safeYoutubeGetVolume(
  api: YoutubePlayerApi,
  original?: () => number,
): number {
  try {
    const fn = original ?? api.getVolume;
    if (typeof fn === "function") {
      return fn.call(api);
    }
  } catch {
    // YouTube iframe API not ready.
  }
  return 100;
}

/** Force a callable getVolume on one YT player instance. */
export function ensureYoutubeGetVolume(
  api: YoutubePlayerApi | null | undefined,
): YoutubePlayerApi | null | undefined {
  if (!api || YOUTUBE_API_PATCHED.has(api)) {
    return api;
  }

  const original = api.getVolume;
  try {
    Object.defineProperty(api, "getVolume", {
      value() {
        return safeYoutubeGetVolume(api, original);
      },
      writable: true,
      configurable: true,
    });
  } catch {
    api.getVolume = () => safeYoutubeGetVolume(api, original);
  }

  YOUTUBE_API_PATCHED.add(api);
  return api;
}

/** @deprecated Use ensureYoutubeGetVolume */
export function wrapYoutubePlayerApi(
  api: YoutubePlayerApi | null | undefined,
): YoutubePlayerApi | null | undefined {
  return ensureYoutubeGetVolume(api);
}

function wrapYoutubePlayerConstructor(
  YT: { Player: new (...args: unknown[]) => YoutubePlayerApi },
): void {
  const Original = YT.Player as typeof YT.Player & { __rithmgenWrapped?: boolean };
  if (Original.__rithmgenWrapped) return;

  const Wrapped = function (
    ...args: unknown[]
  ): YoutubePlayerApi {
    const instance = new Original(...args);
    ensureYoutubeGetVolume(instance);
    return instance;
  };

  Wrapped.prototype = Original.prototype;
  Object.setPrototypeOf(Wrapped, Original);
  Original.__rithmgenWrapped = true;
  YT.Player = Wrapped as unknown as typeof YT.Player;
}

function applyYoutubeIframeApiPatch(): void {
  if (typeof window === "undefined" || youtubeIframeApiPatchApplied) {
    return;
  }

  const YT = (window as Window & { YT?: { Player?: new (...args: unknown[]) => YoutubePlayerApi } })
    .YT;
  if (!YT?.Player) return;

  const proto = YT.Player.prototype;
  if (!YOUTUBE_API_PATCHED.has(proto)) {
    const original = proto.getVolume;
    try {
      Object.defineProperty(proto, "getVolume", {
        value(this: YoutubePlayerApi) {
          return safeYoutubeGetVolume(this, original);
        },
        writable: true,
        configurable: true,
      });
    } catch {
      proto.getVolume = function patchedGetVolume(this: YoutubePlayerApi) {
        return safeYoutubeGetVolume(this, original);
      };
    }
    YOUTUBE_API_PATCHED.add(proto);
  }

  wrapYoutubePlayerConstructor(
    YT as { Player: new (...args: unknown[]) => YoutubePlayerApi },
  );
  youtubeIframeApiPatchApplied = true;
}

/** Patch YT.Player before any embed calls getVolume. */
export function installYoutubeIframeApiPatch(): void {
  if (typeof window === "undefined") return;

  if ((window as Window & { YT?: { Player?: unknown } }).YT?.Player) {
    applyYoutubeIframeApiPatch();
    return;
  }

  if (youtubeIframeApiHookInstalled) return;
  youtubeIframeApiHookInstalled = true;

  const win = window as Window & { onYouTubeIframeAPIReady?: () => void };
  const previous = win.onYouTubeIframeAPIReady;
  win.onYouTubeIframeAPIReady = () => {
    previous?.();
    applyYoutubeIframeApiPatch();
  };
}

/** Patch youtube-video custom element volume getter for all instances. */
function patchYoutubeVideoElementClass(): void {
  if (typeof window === "undefined") return;

  const ctor = customElements.get("youtube-video");
  if (!ctor?.prototype || YOUTUBE_VOLUME_PATCHED.has(ctor.prototype)) return;

  const proto = ctor.prototype as HTMLElement & { volume?: number };
  const desc = Object.getOwnPropertyDescriptor(proto, "volume");
  if (!desc?.get || !desc?.set) return;

  const origGet = desc.get;
  const origSet = desc.set;

  Object.defineProperty(proto, "volume", {
    configurable: true,
    enumerable: desc.enumerable ?? true,
    get() {
      try {
        return origGet.call(this);
      } catch {
        return 1;
      }
    },
    set(value: number) {
      try {
        origSet.call(this, value);
      } catch {
        // YouTube iframe API not ready.
      }
    },
  });

  YOUTUBE_VOLUME_PATCHED.add(ctor.prototype);
}

function interceptYoutubeApiProperty(playerEl: YoutubePlayerElement): void {
  let stored = ensureYoutubeGetVolume(playerEl.api);

  Object.defineProperty(playerEl, "api", {
    configurable: true,
    enumerable: true,
    get() {
      return stored;
    },
    set(value: YoutubePlayerApi | undefined) {
      stored = ensureYoutubeGetVolume(value);
    },
  });
}

function watchYoutubeApiAssignment(playerEl: YoutubePlayerElement): void {
  let attempts = 0;
  const timer = window.setInterval(() => {
    ensureYoutubeGetVolume(playerEl.api);
    attempts += 1;
    if (attempts >= 120) {
      window.clearInterval(timer);
    }
  }, 50);
}

/**
 * Harden youtube-video-element against early getVolume calls from react-player
 * and from YouTube onVolumeChange handlers before the iframe API is ready.
 */
export function patchYoutubeVolumeSafe(
  playerEl: YoutubePlayerElement | null,
): void {
  if (!playerEl || YOUTUBE_VOLUME_PATCHED.has(playerEl)) {
    return;
  }

  installYoutubeIframeApiPatch();
  patchYoutubeVideoElementClass();
  ensureYoutubeGetVolume(playerEl.api);

  try {
    interceptYoutubeApiProperty(playerEl);
  } catch {
    ensureYoutubeGetVolume(playerEl.api);
    watchYoutubeApiAssignment(playerEl);
  }

  YOUTUBE_VOLUME_PATCHED.add(playerEl);
}

if (typeof window !== "undefined") {
  installYoutubeIframeApiPatch();
  patchYoutubeVideoElementClass();
}

/** Pick the highest tier YouTube exposes for this embed. */
export function pickBestQuality(
  levels: string[] | null | undefined,
): string | null {
  if (!levels?.length) return null;
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

/** Select a stable YouTube playback tier for the live slot (no mid-stream thrash). */
export function applyBroadcastQuality(
  playerEl: YoutubePlayerElement | null,
): YoutubeQuality | null {
  const api = playerEl?.api;
  if (!api?.getAvailableQualityLevels || !api?.setPlaybackQuality) {
    return null;
  }

  let levels: string[] | null | undefined;
  try {
    levels = api.getAvailableQualityLevels?.();
  } catch {
    return null;
  }
  if (!levels?.length) return null;

  const best = pickBestQuality(levels);
  if (!best) return null;

  let current: string | undefined;
  try {
    current = api.getPlaybackQuality?.();
  } catch {
    current = undefined;
  }

  // Only change when needed — setPlaybackQuality mid-stream causes crackle.
  if (current !== best) {
    try {
      api.setPlaybackQuality(best);
    } catch {
      // Deprecated in some regions — sizing still helps adaptive bitrate.
    }
  }

  return (best as YoutubeQuality) ?? null;
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

/** Hidden viewport sized for hd720 audio — enough bitrate without 4K thrash. */
export const BROADCAST_PLAYER_WIDTH = 1280;
export const BROADCAST_PLAYER_HEIGHT = 720;

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
