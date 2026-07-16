"use client";

import { useEffect } from "react";
import StreamGate from "@/components/StreamGate";
import PlayerFooter from "@/components/PlayerFooter";
import LiveAudiencePresence from "@/components/LiveAudiencePresence";
import { startAnalyticsHeartbeat } from "@/lib/analytics";
import { useCatalogStore } from "@/store/useCatalogStore";

/**
 * Keeps the YouTube engine and transport mounted for the whole app lifetime,
 * so navigation (profile, admin, pricing) never kills the broadcast.
 * Playback is cleared only on explicit sign-out via stopBroadcast().
 */
export default function BroadcastShell() {
  const loadCatalog = useCatalogStore((s) => s.load);

  useEffect(() => {
    void loadCatalog();
    startAnalyticsHeartbeat();
  }, [loadCatalog]);

  return (
    <>
      <LiveAudiencePresence />
      <StreamGate />
      <PlayerFooter />
    </>
  );
}
