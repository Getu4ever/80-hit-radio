"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native/capacitor";
import {
  canOfferPwaInstall,
  isIosDevice,
  isPwaInstallAvailable,
  PWA_INSTALL_DISMISS_KEY,
  usePwaInstallStore,
} from "@/lib/pwaInstall";

const SW_URL = "/sw.js";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaShell() {
  const deferredPrompt = usePwaInstallStore((s) => s.deferredPrompt);
  const forceShow = usePwaInstallStore((s) => s.forceShow);
  const setDeferredPrompt = usePwaInstallStore((s) => s.setDeferredPrompt);
  const dismissInstallHelp = usePwaInstallStore((s) => s.dismissInstallHelp);
  const tryNativePrompt = usePwaInstallStore((s) => s.tryNativePrompt);
  const clearForceShow = usePwaInstallStore((s) => s.clearForceShow);

  const [autoShow, setAutoShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
      // SW registration failed — install prompt may still work on some browsers.
    });
  }, []);

  useEffect(() => {
    if (!canOfferPwaInstall()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (localStorage.getItem(PWA_INSTALL_DISMISS_KEY) !== "1") {
        setAutoShow(true);
      }
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setAutoShow(false);
      setIosHint(false);
      clearForceShow();
      try {
        localStorage.setItem(PWA_INSTALL_DISMISS_KEY, "1");
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if (isIosDevice() && localStorage.getItem(PWA_INSTALL_DISMISS_KEY) !== "1") {
      setIosHint(true);
      setAutoShow(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setDeferredPrompt, clearForceShow]);

  const visible = forceShow || autoShow;
  // Never show a “Not now”-only card when no install path exists.
  if (!isPwaInstallAvailable(deferredPrompt) || !visible) return null;

  const showIosCopy = isIosDevice() && !deferredPrompt;

  const dismiss = () => {
    dismissInstallHelp();
    setAutoShow(false);
    setIosHint(false);
    clearForceShow();
  };

  const install = async () => {
    const outcome = await tryNativePrompt();
    if (outcome === "unavailable") {
      // Keep panel open with manual instructions (iOS / unsupported).
      setAutoShow(true);
      return;
    }
    setAutoShow(false);
  };

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
        {showIosCopy || iosHint ? (
          <>
            Use <span className="text-white/90">Safari</span> (not Chrome). Tap
            the Share button{" "}
            <span className="text-cyan-200" aria-hidden>
              □↑
            </span>
            , then <span className="text-white/90">scroll down</span> and tap{" "}
            <span className="text-white/90">Add to Home Screen</span>. Don’t tap
            Options / PDF — that only shares the page.
          </>
        ) : (
          "Install the app for a dedicated radio window, faster launch, and better background listening."
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {deferredPrompt ? (
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
