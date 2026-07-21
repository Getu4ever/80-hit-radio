"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import StreamGate from "@/components/StreamGate";
import PlayerFooter from "@/components/PlayerFooter";
import NewsBulletinPlayer from "@/components/NewsBulletinPlayer";
import PwaShell from "@/components/PwaShell";
import NativeShell from "@/components/NativeShell";
import LiveAudiencePresence from "@/components/LiveAudiencePresence";
import { startAnalyticsHeartbeat } from "@/lib/analytics";
import { useAudioStore } from "@/store/useAudioStore";
import { useCatalogStore } from "@/store/useCatalogStore";

function isAuthChromePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/auth") || pathname.startsWith("/checkout");
}

/**
 * Keeps the YouTube engine and transport mounted for the whole app lifetime,
 * so navigation (profile, admin, pricing) never kills the broadcast.
 * Playback is cleared only on explicit sign-out via stopBroadcast().
 */
export default function BroadcastShell() {
  const pathname = usePathname();
  const loadCatalog = useCatalogStore((s) => s.load);
  const catalogLoaded = useCatalogStore((s) => s.loaded);
  const hidePlayer = isAuthChromePath(pathname);

  useEffect(() => {
    void loadCatalog();
    startAnalyticsHeartbeat();
  }, [loadCatalog]);

  // Cue the first track as soon as the catalog is ready so YouTube can buffer
  // before the user taps Play (cuts cold-start delay on refresh/open).
  useEffect(() => {
    if (!catalogLoaded) return;
    useAudioStore.getState().cueRadio();
  }, [catalogLoaded]);

  return (
    <>
      <LiveAudiencePresence />
      <StreamGate />
      <NewsBulletinPlayer />
      <NativeShell />
      <PwaShell />
      {!hidePlayer ? <PlayerFooter /> : null}
    </>
  );
}
