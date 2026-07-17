"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import StreamGate from "@/components/StreamGate";
import PlayerFooter from "@/components/PlayerFooter";
import LiveAudiencePresence from "@/components/LiveAudiencePresence";
import { startAnalyticsHeartbeat } from "@/lib/analytics";
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
  const hidePlayer = isAuthChromePath(pathname);

  useEffect(() => {
    void loadCatalog();
    startAnalyticsHeartbeat();
  }, [loadCatalog]);

  return (
    <>
      <LiveAudiencePresence />
      <StreamGate />
      {!hidePlayer ? <PlayerFooter /> : null}
    </>
  );
}
