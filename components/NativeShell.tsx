"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native/capacitor";
import {
  resumeBroadcastPlayback,
  startSilentKeepAlive,
} from "@/lib/mediaPlayback";
import { reassertBroadcastWakeLock } from "@/lib/wakeLock";
import { useAudioStore } from "@/store/useAudioStore";

/**
 * Capacitor lifecycle bridge — status bar, splash, and resume → keep radio alive.
 * Only mounts behavior when running inside the native iOS/Android shell.
 */
export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    async function boot() {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        if (cancelled) return;
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#07040f" });
      } catch {
        // Plugin unavailable on this build.
      }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (cancelled) return;
        await SplashScreen.hide();
      } catch {
        // ignore
      }

      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        const resumeRadio = () => {
          // Always pulse keep-alive; when playing, reassert live+standby slots
          // (flushPendingMediaPlay alone is a no-op without a fresh tap token).
          startSilentKeepAlive();
          reassertBroadcastWakeLock();
          if (useAudioStore.getState().isPlaying) {
            resumeBroadcastPlayback();
          }
        };

        const stateHandle = await App.addListener("appStateChange", (state) => {
          if (state.isActive) {
            resumeRadio();
          } else {
            // Best-effort pulse before the WebView suspends timers.
            startSilentKeepAlive();
          }
        });
        cleanups.push(() => {
          void stateHandle.remove();
        });

        const urlHandle = await App.addListener("appUrlOpen", () => {
          // Deep links land on the live web origin via capacitor.config allowNavigation.
        });
        cleanups.push(() => {
          void urlHandle.remove();
        });

        resumeRadio();
      } catch {
        // App plugin missing.
      }

      document.documentElement.dataset.nativeShell = "1";
    }

    void boot();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
      delete document.documentElement.dataset.nativeShell;
    };
  }, []);

  return null;
}
