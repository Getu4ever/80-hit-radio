import { create } from "zustand";
import {
  RADIO_GENRES,
  type Subgenre,
  type Track,
} from "@/data/tracks";
import type { CatalogSource } from "@/lib/catalog/static";

interface CatalogState {
  tracks: Track[];
  source: CatalogSource | null;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  getTracksBySubgenre: (subgenre: Subgenre | "All") => Track[];
  getRadioTracks: () => Track[];
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  tracks: [],
  source: null,
  loading: false,
  error: null,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/catalog", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load catalog");
      const data = (await res.json()) as {
        tracks: Track[];
        source: CatalogSource;
      };
      set({
        tracks: data.tracks,
        source: data.source,
        loading: false,
        loaded: true,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Catalog error",
      });
    }
  },

  getTracksBySubgenre: (subgenre) => {
    const { tracks } = get();
    if (subgenre === "All") return tracks;
    return tracks.filter((t) => t.subgenre === subgenre);
  },

  getRadioTracks: () => {
    const { tracks } = get();
    return tracks.filter((t) => RADIO_GENRES.includes(t.subgenre));
  },
}));
