import { PRODUCTION_APP_URL } from "@/lib/env";

export type ShareTrack = {
  artist: string;
  title: string;
};

export type SharePayload = {
  url: string;
  title: string;
  text: string;
};

/** Canonical URL always shared with friends (never localhost / preview). */
export function getShareUrl() {
  return PRODUCTION_APP_URL;
}

export function buildSharePayload(
  track?: ShareTrack | null,
  variant: "on-air" | "lounge" = "on-air",
): SharePayload {
  const url = getShareUrl();

  if (variant === "lounge") {
    return {
      url,
      title: "RithmGen — 80s Hit Radio",
      text: "Join me on RithmGen — non-stop classic hits and the listener community.",
    };
  }

  if (track?.artist && track?.title) {
    return {
      url,
      title: "RithmGen — 80s Hit Radio",
      text: `Listening to ${track.artist} — ${track.title} on RithmGen. Tune in with me:`,
    };
  }

  return {
    url,
    title: "RithmGen — 80s Hit Radio",
    text: "Tune into RithmGen — non-stop classic hits. Join the community:",
  };
}

export function buildNetworkShareUrls(payload: SharePayload) {
  const composed = `${payload.text} ${payload.url}`.trim();
  return {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(composed)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(payload.url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(composed)}`,
  };
}

export function canUseNativeShare() {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  // Prefer the OS sheet on touch / coarse-pointer devices; desktop keeps the quiet menu.
  if (typeof window !== "undefined") {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return true;
    } catch {
      /* ignore */
    }
  }
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
