"use client";

import { create } from "zustand";
import { isNativeApp } from "@/lib/native/capacitor";

export const PWA_INSTALL_DISMISS_KEY = "rithmgen-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallState = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** User asked to see install help again (after Not now). */
  forceShow: boolean;
  setDeferredPrompt: (event: BeforeInstallPromptEvent | null) => void;
  requestInstallHelp: () => void;
  dismissInstallHelp: () => void;
  clearForceShow: () => void;
  tryNativePrompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** True when the page is a normal browser tab (not already installed / native). */
export function canOfferPwaInstall(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return false;
  if (isStandaloneDisplay()) return false;
  return true;
}

/**
 * True only when the user can actually install right now:
 * - Chrome/Edge (and similar) after `beforeinstallprompt`, or
 * - iPhone/iPad Safari via Add to Home Screen.
 * Hides the dead “Not now”-only panel on desktop Safari/Firefox/etc.
 */
export function isPwaInstallAvailable(
  deferredPrompt: BeforeInstallPromptEvent | null,
): boolean {
  if (!canOfferPwaInstall()) return false;
  if (deferredPrompt) return true;
  return isIosDevice();
}

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  deferredPrompt: null,
  forceShow: false,
  setDeferredPrompt: (event) => set({ deferredPrompt: event }),
  requestInstallHelp: () => {
    try {
      localStorage.removeItem(PWA_INSTALL_DISMISS_KEY);
    } catch {
      // ignore
    }
    set({ forceShow: true });
  },
  dismissInstallHelp: () => {
    try {
      localStorage.setItem(PWA_INSTALL_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    set({ forceShow: false });
  },
  clearForceShow: () => set({ forceShow: false }),
  tryNativePrompt: async () => {
    const promptEvent = get().deferredPrompt;
    if (!promptEvent) return "unavailable";
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    set({ deferredPrompt: null, forceShow: false });
    if (choice.outcome === "accepted") {
      try {
        localStorage.setItem(PWA_INSTALL_DISMISS_KEY, "1");
      } catch {
        // ignore
      }
    }
    return choice.outcome;
  },
}));
