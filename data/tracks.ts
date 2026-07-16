import catalog from "./catalog.json";

export type Subgenre =
  | "Pop"
  | "Rock"
  | "Hip-Hop / Rap"
  | "R&B"
  | "Electronic / Dance"
  | "Jazz"
  | "Country"
  | "Classical"
  | "Reggae"
  | "Latin Music"
  | "Metal"
  | "Soul / Funk"
  | "Indie / Alternative"
  | "Blues"
  | "Gospel / Christian"
  | "Afrobeat / Amapiano"
  | "K-Pop"
  | "Folk / Acoustic"
  | "Disco"
  | "New Age / Ambient";

export interface Track {
  id: string;
  title: string;
  artist: string;
  year: number;
  youtubeId: string;
  subgenre: Subgenre;
  /** YouTube thumbnail — always relevant to the track. */
  imageUrl: string;
}

/** Live Radio only draws from these mainstream 80s genres. */
export const RADIO_GENRES: Subgenre[] = [
  "Pop",
  "Rock",
  "R&B",
  "Reggae",
  "Electronic / Dance",
];

export const SUBGENRES: Subgenre[] = [
  "Pop",
  "Rock",
  "Hip-Hop / Rap",
  "R&B",
  "Electronic / Dance",
  "Jazz",
  "Country",
  "Classical",
  "Reggae",
  "Latin Music",
  "Metal",
  "Soul / Funk",
  "Indie / Alternative",
  "Blues",
  "Gospel / Christian",
  "Afrobeat / Amapiano",
  "K-Pop",
  "Folk / Acoustic",
  "Disco",
  "New Age / Ambient",
];

export const POPULAR_GENRES: Subgenre[] = [
  "Pop",
  "Rock",
  "Hip-Hop / Rap",
  "R&B",
  "Electronic / Dance",
];

export const MORE_GENRES: Subgenre[] = SUBGENRES.filter(
  (g) => !POPULAR_GENRES.includes(g),
);

export function youtubeThumb(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

type CatalogRow = [string, string, number, string];
type CatalogMap = Record<string, CatalogRow[]>;

const raw = catalog as unknown as CatalogMap;

function buildTracks(): Track[] {
  const all: Track[] = [];
  let n = 0;

  for (const genre of SUBGENRES) {
    const rows = raw[genre] ?? [];
    for (const [title, artist, year, youtubeId] of rows) {
      n += 1;
      all.push({
        id: String(n),
        title,
        artist,
        year,
        youtubeId,
        subgenre: genre,
        imageUrl: youtubeThumb(youtubeId),
      });
    }
  }

  return all;
}

export const tracks: Track[] = buildTracks();

export function getTracksBySubgenre(subgenre: Subgenre | "All"): Track[] {
  if (subgenre === "All") return tracks;
  return tracks.filter((t) => t.subgenre === subgenre);
}

/** Pool used by continuous Live Radio (mainstream only). */
export function getRadioTracks(): Track[] {
  return tracks.filter((t) => RADIO_GENRES.includes(t.subgenre));
}
