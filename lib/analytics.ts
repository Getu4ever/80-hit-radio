"use client";

const SESSION_KEY = "80s-radio-session-id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let sessionStarted = false;

async function postJson(url: string, body: Record<string, unknown>) {
  try {
    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Analytics should never block playback.
  }
}

export function trackListenEvent(
  eventType: "play_start" | "play_complete" | "skip" | "session_start",
  trackId?: string | null,
  durationSeconds?: number,
) {
  void postJson("/api/analytics/event", {
    eventType,
    trackId: trackId ?? null,
    durationSeconds: durationSeconds ?? null,
    sessionId: getSessionId(),
  });
}

export function startAnalyticsHeartbeat() {
  if (heartbeatTimer) return;

  if (!sessionStarted) {
    sessionStarted = true;
    trackListenEvent("session_start");
  }

  const ping = () => {
    void postJson("/api/analytics/heartbeat", { sessionId: getSessionId() });
  };

  ping();
  heartbeatTimer = setInterval(ping, 30_000);
}

export function stopAnalyticsHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
