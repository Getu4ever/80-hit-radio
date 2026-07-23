import catalog from "@/data/catalog.json";
import { trackImagePath } from "@/lib/trackImages";
import { SUBGENRES, type Subgenre, type Track } from "@/data/tracks";

type CatalogRow = [string, string, number, string];
type CatalogMap = Record<string, CatalogRow[]>;

const raw = catalog as unknown as CatalogMap;

/** Build the bundled static catalog (fallback when DB is empty). */
export function buildStaticTracks(): Track[] {
  const all: Track[] = [];
  let n = 0;

  for (const genre of SUBGENRES) {
    const rows = raw[genre] ?? [];
    for (const [title, artist, year, youtubeId] of rows) {
      n += 1;
      all.push({
        id: `static-${n}`,
        title,
        artist,
        year,
        youtubeId,
        subgenre: genre as Subgenre,
        imageUrl: trackImagePath(youtubeId),
      });
    }
  }

  return all;
}

export type CatalogSource = "database" | "static";

export function normalizeArtistName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface DbTrackRow {
  id: string;
  title: string;
  artist: string;
  artist_id: string | null;
  year: number;
  youtube_id: string;
  subgenre: string;
  created_at: string;
  updated_at: string;
  artists?: { image_url: string | null } | null;
}

export function dbTrackToTrack(row: DbTrackRow): Track {
  const artistImage = row.artists?.image_url?.trim() || null;
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    year: row.year,
    youtubeId: row.youtube_id,
    subgenre: row.subgenre as Subgenre,
    // Prefer uploaded artist portrait; otherwise Storage CDN track art.
    imageUrl: artistImage || trackImagePath(row.youtube_id),
  };
}
