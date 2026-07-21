"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native/capacitor";

const SW_URL = "/sw.js";
const INSTALL_DISMISS_KEY = "rithmgen-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PwaShell() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    // Capacitor already is the installed app — skip SW + install prompts.
    if (isNativeApp()) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
      // SW registration failed — install prompt may still work on some browsers.
    });
  }, []);

  useEffect(() => {
    if (isNativeApp()) return;
    if (isStandaloneDisplay()) return;
    if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIos()) {
      setShowIosHint(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    setShowBanner(false);
    setShowIosHint(false);
    setInstallEvent(null);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    setShowBanner(false);
    if (choice.outcome === "accepted") {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    }
  };

  if (isNativeApp()) return null;
  if (isStandaloneDisplay()) return null;
  if (!showBanner && !showIosHint) return null;

  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[90] w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-cyan-400/25 bg-[#0a0614]/95 p-4 shadow-[0_0_32px_rgba(0,0,0,0.45),0_0_24px_rgba(34,211,238,0.12)] backdrop-blur-xl"
      role="region"
      aria-label="Install app"
    >
      <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">
        Install RithmGen
      </p>
      <p className="mt-2 text-sm leading-relaxed text-white/75">
        {showIosHint && !installEvent
          ? "On iPhone/iPad: tap Share, then “Add to Home Screen” for app-like playback and lock-screen controls."
          : "Install the app for a dedicated radio window, faster launch, and better background listening."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {installEvent ? (
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Install app
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/5"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
