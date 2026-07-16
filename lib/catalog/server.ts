import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildStaticTracks,
  dbTrackToTrack,
  normalizeArtistName,
  type CatalogSource,
  type DbTrackRow,
} from "@/lib/catalog/static";
import { SUBGENRES, type Subgenre, type Track } from "@/data/tracks";
import type { Json } from "@/types/database.types";

export type { CatalogSource };

export interface CatalogPayload {
  tracks: Track[];
  source: CatalogSource;
  total: number;
}

export interface ArtistRecord {
  id: string;
  name: string;
  normalized_name: string;
  image_url: string | null;
  track_count: number;
  created_at: string;
  updated_at: string;
}

export interface SiteAnalytics {
  concurrentListeners: number;
  playsToday: number;
  skipsToday: number;
  sessionsToday: number;
  topTracks: Array<{
    trackId: string;
    title: string;
    artist: string;
    plays: number;
  }>;
  playsByGenre: Array<{ subgenre: string; plays: number }>;
  signupsLast7Days: number[];
}

const TRACK_SELECT = `
  id, title, artist, artist_id, year, youtube_id, subgenre, created_at, updated_at,
  artists ( image_url )
`;

async function countDbTracks(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("tracks")
    .select("id", { count: "exact", head: true });
  if (error) {
    // Table may not exist before migration 004 is applied.
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return 0;
    }
    throw error;
  }
  return count ?? 0;
}

export async function getCatalogSummary(): Promise<{
  total: number;
  source: CatalogSource;
}> {
  if (!isSupabaseConfigured()) {
    const tracks = buildStaticTracks();
    return { total: tracks.length, source: "static" };
  }

  const dbCount = await countDbTracks();
  if (dbCount === 0) {
    const tracks = buildStaticTracks();
    return { total: tracks.length, source: "static" };
  }

  return { total: dbCount, source: "database" };
}

export async function getCatalog(): Promise<CatalogPayload> {
  if (!isSupabaseConfigured()) {
    const tracks = buildStaticTracks();
    return { tracks, source: "static", total: tracks.length };
  }

  const dbCount = await countDbTracks();
  if (dbCount === 0) {
    const tracks = buildStaticTracks();
    return { tracks, source: "static", total: tracks.length };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tracks")
    .select(TRACK_SELECT)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const tracks = ((data ?? []) as DbTrackRow[]).map(dbTrackToTrack);
  return { tracks, source: "database", total: tracks.length };
}

export async function listAdminTracks(): Promise<Track[]> {
  const { tracks } = await getCatalog();
  return tracks;
}

export async function createTrack(input: {
  title: string;
  artist: string;
  year: number;
  youtubeId: string;
  subgenre: Subgenre;
}): Promise<Track> {
  const existing = await countDbTracks();
  if (existing === 0) {
    await seedCatalogFromStatic();
  }

  const admin = createAdminClient();
  const artistId = await ensureArtist(input.artist);

  const { data, error } = await admin
    .from("tracks")
    .insert({
      title: input.title.trim(),
      artist: input.artist.trim(),
      artist_id: artistId,
      year: input.year,
      youtube_id: input.youtubeId.trim(),
      subgenre: input.subgenre,
    })
    .select(TRACK_SELECT)
    .single();

  if (error) throw error;
  return dbTrackToTrack(data as DbTrackRow);
}

export async function deleteTrack(trackId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("tracks").delete().eq("id", trackId);
  if (error) throw error;
}

export async function seedCatalogFromStatic(): Promise<{ imported: number }> {
  const admin = createAdminClient();
  const existing = await countDbTracks();
  if (existing > 0) {
    return { imported: 0 };
  }

  const staticTracks = buildStaticTracks();
  const artistMap = new Map<string, string>();

  for (const track of staticTracks) {
    const key = normalizeArtistName(track.artist);
    if (!artistMap.has(key)) {
      const { data, error } = await admin
        .from("artists")
        .upsert(
          { name: track.artist, normalized_name: key },
          { onConflict: "normalized_name" },
        )
        .select("id")
        .single();
      if (error) throw error;
      artistMap.set(key, data.id);
    }
  }

  const rows = staticTracks.map((track) => ({
    title: track.title,
    artist: track.artist,
    artist_id: artistMap.get(normalizeArtistName(track.artist)) ?? null,
    year: track.year,
    youtube_id: track.youtubeId,
    subgenre: track.subgenre,
  }));

  const chunkSize = 200;
  let imported = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await admin.from("tracks").insert(chunk);
    if (error) throw error;
    imported += chunk.length;
  }

  return { imported };
}

async function ensureArtist(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const normalized = normalizeArtistName(trimmed);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("artists")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from("artists")
    .insert({ name: trimmed, normalized_name: normalized })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function listArtists(): Promise<ArtistRecord[]> {
  const admin = createAdminClient();
  const { data: artists, error } = await admin
    .from("artists")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;

  const { data: trackCounts, error: countError } = await admin
    .from("tracks")
    .select("artist_id");

  if (countError) throw countError;

  const counts = new Map<string, number>();
  for (const row of trackCounts ?? []) {
    if (!row.artist_id) continue;
    counts.set(row.artist_id, (counts.get(row.artist_id) ?? 0) + 1);
  }

  return (artists ?? []).map((artist) => ({
    ...artist,
    track_count: counts.get(artist.id) ?? 0,
  }));
}

export async function updateArtistImage(
  artistId: string,
  imageUrl: string,
): Promise<ArtistRecord> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("artists")
    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", artistId)
    .select("*")
    .single();

  if (error) throw error;

  const { count } = await admin
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId);

  return { ...data, track_count: count ?? 0 };
}

export async function uploadArtistImage(
  artistId: string,
  file: File,
): Promise<ArtistRecord> {
  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${artistId}/${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("rithmgen-assets")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = admin.storage
    .from("rithmgen-assets")
    .getPublicUrl(path);

  return updateArtistImage(artistId, publicData.publicUrl);
}

export async function recordListenEvent(input: {
  eventType: "play_start" | "play_complete" | "skip" | "session_start";
  trackId?: string | null;
  userId?: string | null;
  durationSeconds?: number;
  metadata?: Json;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = createAdminClient();
  const { error } = await admin.from("listen_events").insert({
    event_type: input.eventType,
    track_id: input.trackId ?? null,
    user_id: input.userId ?? null,
    duration_seconds: input.durationSeconds ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("recordListenEvent:", error.message);
}

export async function upsertListenerPresence(input: {
  sessionId: string;
  userId?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = createAdminClient();
  const { error } = await admin.from("listener_presence").upsert(
    {
      session_id: input.sessionId,
      user_id: input.userId ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
  if (error) console.error("upsertListenerPresence:", error.message);
}

function emptySiteAnalytics(): SiteAnalytics {
  return {
    concurrentListeners: 0,
    playsToday: 0,
    skipsToday: 0,
    sessionsToday: 0,
    topTracks: [],
    playsByGenre: [],
    signupsLast7Days: Array.from({ length: 7 }, () => 0),
  };
}

function isMissingAnalyticsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  );
}

function logAnalyticsQueryError(label: string, error: { message?: string } | null) {
  if (error) {
    console.error(`getSiteAnalytics ${label}:`, error.message ?? error);
  }
}

export async function getSiteAnalytics(): Promise<SiteAnalytics> {
  if (!isSupabaseConfigured()) {
    return emptySiteAnalytics();
  }

  const admin = createAdminClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const presenceCutoff = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    presenceRes,
    eventsTodayRes,
    topTracksRes,
    genreRes,
    signupsRes,
  ] = await Promise.all([
    admin
      .from("listener_presence")
      .select("session_id", { count: "exact", head: true })
      .gte("last_seen_at", presenceCutoff),
    admin
      .from("listen_events")
      .select("event_type")
      .gte("created_at", startOfDay.toISOString()),
    admin
      .from("listen_events")
      .select("track_id, tracks ( title, artist )")
      .eq("event_type", "play_start")
      .gte("created_at", weekAgo.toISOString()),
    admin
      .from("listen_events")
      .select("track_id, tracks ( subgenre )")
      .eq("event_type", "play_start")
      .gte("created_at", weekAgo.toISOString()),
    admin
      .from("profiles")
      .select("created_at")
      .gte("created_at", weekAgo.toISOString()),
  ]);

  const analyticsErrors = [
    presenceRes.error,
    eventsTodayRes.error,
    topTracksRes.error,
    genreRes.error,
    signupsRes.error,
  ].filter(Boolean);

  if (
    analyticsErrors.length > 0 &&
    analyticsErrors.every((error) => isMissingAnalyticsTable(error))
  ) {
    return emptySiteAnalytics();
  }

  for (const [label, result] of [
    ["presence", presenceRes],
    ["eventsToday", eventsTodayRes],
    ["topTracks", topTracksRes],
    ["genre", genreRes],
    ["signups", signupsRes],
  ] as const) {
    if (result.error && !isMissingAnalyticsTable(result.error)) {
      logAnalyticsQueryError(label, result.error);
    }
  }

  const eventsToday = eventsTodayRes.error ? [] : (eventsTodayRes.data ?? []);
  const playsToday = eventsToday.filter((e) => e.event_type === "play_start").length;
  const skipsToday = eventsToday.filter((e) => e.event_type === "skip").length;
  const sessionsToday = eventsToday.filter(
    (e) => e.event_type === "session_start",
  ).length;

  const playCounts = new Map<
    string,
    { title: string; artist: string; plays: number }
  >();
  for (const row of topTracksRes.error ? [] : (topTracksRes.data ?? [])) {
    if (!row.track_id) continue;
    const track = row.tracks as { title: string; artist: string } | null;
    if (!track) continue;
    const existing = playCounts.get(row.track_id);
    if (existing) {
      existing.plays += 1;
    } else {
      playCounts.set(row.track_id, {
        title: track.title,
        artist: track.artist,
        plays: 1,
      });
    }
  }

  const topTracks = [...playCounts.entries()]
    .map(([trackId, info]) => ({ trackId, ...info }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 8);

  const genreCounts = new Map<string, number>();
  for (const row of genreRes.error ? [] : (genreRes.data ?? [])) {
    const track = row.tracks as { subgenre: string } | null;
    if (!track?.subgenre) continue;
    genreCounts.set(
      track.subgenre,
      (genreCounts.get(track.subgenre) ?? 0) + 1,
    );
  }

  const playsByGenre = SUBGENRES.map((subgenre) => ({
    subgenre,
    plays: genreCounts.get(subgenre) ?? 0,
  })).filter((g) => g.plays > 0);

  const signupsLast7Days = Array.from({ length: 7 }, () => 0);
  for (const profile of signupsRes.error ? [] : (signupsRes.data ?? [])) {
    const created = new Date(profile.created_at);
    const dayIndex = Math.floor(
      (created.getTime() - weekAgo.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (dayIndex >= 0 && dayIndex < 7) {
      signupsLast7Days[dayIndex] += 1;
    }
  }

  return {
    concurrentListeners: presenceRes.error ? 0 : (presenceRes.count ?? 0),
    playsToday,
    skipsToday,
    sessionsToday,
    topTracks,
    playsByGenre,
    signupsLast7Days,
  };
}

export async function getLiveAudienceMetrics() {
  if (!isSupabaseConfigured()) {
    return {
      concurrentListeners: 0,
      activeSessions: 0,
      recentActiveUsers: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const admin = createAdminClient();
  const now = new Date();
  const presenceCutoff = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  const [presenceRes, recentListenersRes] = await Promise.all([
    admin
      .from("listener_presence")
      .select("session_id", { count: "exact", head: true })
      .gte("last_seen_at", presenceCutoff),
    admin
      .from("listener_presence")
      .select("user_id", { count: "exact", head: true })
      .gte("last_seen_at", presenceCutoff),
  ]);

  return {
    concurrentListeners: presenceRes.count ?? 0,
    activeSessions: presenceRes.count ?? 0,
    recentActiveUsers: recentListenersRes.count ?? 0,
    lastUpdatedAt: now.toISOString(),
  };
}

export function isValidYoutubeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

export function isValidSubgenre(value: string): value is Subgenre {
  return (SUBGENRES as string[]).includes(value);
}
