import type { Track } from "@/data/tracks";

const PLAY_PREFIX =
  /^(?:please\s+)?(?:play|start|queue|put on|spin|cue)\s+/i;

/** Strip playback verbs and return the catalog search phrase. */
export function parseVoiceCommand(transcript: string): string | null {
  const raw = transcript.trim().toLowerCase();
  if (!raw) return null;

  let query = raw.replace(PLAY_PREFIX, "").trim();
  query = query.replace(/^(?:the\s+song\s+|song\s+)/i, "").trim();
  query = query.replace(/[.!?]+$/, "").trim();

  return query.length > 0 ? query : null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Score how well a track matches a spoken query (higher = closer). */
function scoreTrack(track: Track, query: string): number {
  const q = normalize(query);
  if (!q) return 0;

  const title = normalize(track.title);
  const artist = normalize(track.artist);
  const combined = `${artist} ${title}`;
  const reversed = `${title} ${artist}`;

  if (combined === q || reversed === q) return 10_000;
  if (title === q || artist === q) return 9_000;
  if (combined.includes(q) || reversed.includes(q)) return 8_000;
  if (title.includes(q) || artist.includes(q)) return 7_000;

  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    if (artist.includes(token)) score += 45;
    if (title.includes(token)) score += 40;
    if (String(track.year).includes(token)) score += 15;
    if (combined.includes(token)) score += 10;
  }

  if (tokens.every((token) => combined.includes(token))) score += 120;
  return score;
}

/** Find the best catalog match for a voice query, or null if nothing fits. */
export function findTrackByVoiceQuery(
  query: string,
  tracks: Track[],
): Track | null {
  if (!query.trim() || tracks.length === 0) return null;

  let best: Track | null = null;
  let bestScore = 0;

  for (const track of tracks) {
    const score = scoreTrack(track, query);
    if (score > bestScore) {
      bestScore = score;
      best = track;
    }
  }

  // Require at least one meaningful token overlap.
  return bestScore >= 40 ? best : null;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.SpeechRecognition ?? window.webkitSpeechRecognition,
  );
}

export function createSpeechRecognition(): SpeechRecognition | null {
  if (!isSpeechRecognitionSupported()) return null;
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;
  return recognition;
}
