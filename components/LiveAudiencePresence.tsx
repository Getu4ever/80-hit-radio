"use client";

import { useEffect } from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const SESSION_KEY = "rithmgen-player-session";

function getSessionId() {
  if (typeof window === "undefined") return "";
  let sessionId = window.localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rithmgen-${Date.now()}`;
    window.localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export default function LiveAudiencePresence() {
  useEffect(() => {
    const sessionId = getSessionId();
    const supabase = createClient();
    const channel = supabase.channel("live-stream");

    channel.subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        void channel.track({
          session_id: sessionId,
          status: "listening",
        });
      }
    });

    return () => {
      void channel.untrack();
      void channel.unsubscribe();
    };
  }, []);

  return null;
}
