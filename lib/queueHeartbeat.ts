/**
 * Background-tab queue heartbeat.
 *
 * Browsers freeze/throttle main-thread timers and media `timeupdate`/`ended`
 * callbacks while a tab is hidden, which stalls React-driven track swaps.
 * This dedicated Worker keeps a wall-clock deadline and posts `advance` /
 * `prefetch` even when the document is in the background.
 */

export type QueueHeartbeatSync = {
  trackId: string | null;
  durationSec: number;
  playedSec: number;
  isPlaying: boolean;
  /** Seconds before natural end to force the next-track handoff. */
  handoffSec?: number;
  /** Progress ratio (0–1) at which to warm the upcoming track. */
  prefetchRatio?: number;
};

export type QueueHeartbeatHandlers = {
  onAdvance: (trackId: string) => void;
  onPrefetch?: (trackId: string) => void;
};

type WorkerIn =
  | ({ type: "sync" } & QueueHeartbeatSync)
  | { type: "stop" };

type WorkerOut =
  | { type: "advance"; trackId: string; reason: "deadline" | "tick" }
  | { type: "prefetch"; trackId: string };

const WORKER_SOURCE = `
var trackId = null;
var durationSec = 0;
var playedSec = 0;
var isPlaying = false;
var handoffSec = 0.25;
var prefetchRatio = 0.95;
var deadlineAt = 0;
var prefetchAt = 0;
var prefetchSent = false;
var advanceSent = false;
var timer = null;
var tickMs = 200;

function clearTimer() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

function recompute() {
  if (!isPlaying || !trackId || !(durationSec > 0) || !isFinite(durationSec)) {
    deadlineAt = 0;
    prefetchAt = 0;
    return;
  }
  var remainingToHandoff = Math.max(0, durationSec - playedSec - handoffSec);
  deadlineAt = Date.now() + remainingToHandoff * 1000;
  var prefetchAtSec = durationSec * prefetchRatio;
  var remainingToPrefetch = Math.max(0, prefetchAtSec - playedSec);
  prefetchAt = Date.now() + remainingToPrefetch * 1000;
}

function tick() {
  if (!isPlaying || !trackId) return;
  var now = Date.now();
  if (prefetchAt > 0 && !prefetchSent && now >= prefetchAt) {
    prefetchSent = true;
    self.postMessage({ type: "prefetch", trackId: trackId });
  }
  if (deadlineAt > 0 && !advanceSent && now >= deadlineAt) {
    advanceSent = true;
    self.postMessage({ type: "advance", trackId: trackId, reason: "deadline" });
  }
}

self.onmessage = function (event) {
  var msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "stop") {
    clearTimer();
    trackId = null;
    isPlaying = false;
    durationSec = 0;
    playedSec = 0;
    deadlineAt = 0;
    prefetchAt = 0;
    advanceSent = false;
    prefetchSent = false;
    return;
  }

  if (msg.type === "sync") {
    var nextId = msg.trackId || null;
    var trackChanged = nextId !== trackId;
    trackId = nextId;
    if (typeof msg.durationSec === "number" && isFinite(msg.durationSec)) {
      durationSec = msg.durationSec;
    }
    if (typeof msg.playedSec === "number" && isFinite(msg.playedSec)) {
      playedSec = msg.playedSec;
    }
    isPlaying = !!msg.isPlaying && !!trackId;
    if (typeof msg.handoffSec === "number" && isFinite(msg.handoffSec)) {
      handoffSec = msg.handoffSec;
    }
    if (typeof msg.prefetchRatio === "number" && isFinite(msg.prefetchRatio)) {
      prefetchRatio = msg.prefetchRatio;
    }
    if (trackChanged || !isPlaying) {
      advanceSent = false;
      prefetchSent = false;
    }
    recompute();
    if (isPlaying) {
      if (timer == null) timer = setInterval(tick, tickMs);
      tick();
    } else {
      clearTimer();
    }
  }
};
`;

export type QueueHeartbeatController = {
  sync: (state: QueueHeartbeatSync) => void;
  stop: () => void;
  dispose: () => void;
};

/** Create an isolated Worker heartbeat (Blob URL — no separate asset fetch). */
export function createQueueHeartbeat(
  handlers: QueueHeartbeatHandlers,
): QueueHeartbeatController {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return {
      sync() {},
      stop() {},
      dispose() {},
    };
  }

  let worker: Worker | null = null;
  let blobUrl: string | null = null;

  try {
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    blobUrl = URL.createObjectURL(blob);
    worker = new Worker(blobUrl);
  } catch {
    return {
      sync() {},
      stop() {},
      dispose() {},
    };
  }

  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "advance" && msg.trackId) {
      handlers.onAdvance(msg.trackId);
      return;
    }
    if (msg.type === "prefetch" && msg.trackId) {
      handlers.onPrefetch?.(msg.trackId);
    }
  };

  const post = (msg: WorkerIn) => {
    try {
      worker?.postMessage(msg);
    } catch {
      // Worker may already be terminated.
    }
  };

  return {
    sync(state) {
      post({ type: "sync", ...state });
    },
    stop() {
      post({ type: "stop" });
    },
    dispose() {
      post({ type: "stop" });
      try {
        worker?.terminate();
      } catch {
        // ignore
      }
      worker = null;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
    },
  };
}
