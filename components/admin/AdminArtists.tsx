"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

type Artist = {
  id: string;
  name: string;
  image_url: string | null;
  track_count: number;
};

export default function AdminArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/artists", { credentials: "include" });
      if (!res.ok) {
        setError("Failed to load artists");
        return;
      }
      const data = (await res.json()) as { artists: Artist[] };
      setArtists(data.artists);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((artist) => artist.name.toLowerCase().includes(q));
  }, [artists, query]);

  async function handleUpload(artistId: string, file: File) {
    setUploadingId(artistId);
    setError(null);
    try {
      const form = new FormData();
      form.append("artistId", artistId);
      form.append("file", file);

      const res = await fetch("/api/admin/artists", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (!res.ok) {
        setError("Upload failed");
        return;
      }

      const data = (await res.json()) as { artist: Artist };
      setArtists((prev) =>
        prev.map((a) => (a.id === artistId ? data.artist : a)),
      );
    } finally {
      setUploadingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-white/50">Loading artists…</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-400/70">
          Artist portraits
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
          Replace artist pictures
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Upload a portrait for any artist. It replaces the default YouTube
          thumbnail on all of that artist&apos;s tracks across the site.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artist name…"
            className="min-w-[12rem] flex-1 rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-sm text-white placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-fuchsia-300">{error}</p>}
      </section>

      {artists.length === 0 ? (
        <p className="text-sm text-white/45">
          No artists in the database yet. Import the catalog from the Catalog tab
          first, or add a track to create artist records automatically.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((artist) => (
            <article
              key={artist.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="relative mb-4 aspect-square overflow-hidden rounded-xl bg-[#0a0614]">
                {artist.image_url ? (
                  <Image
                    src={artist.image_url}
                    alt={artist.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white/40">
                    No custom image
                  </div>
                )}
              </div>

              <h3 className="font-[family-name:var(--font-display)] text-lg text-white">
                {artist.name}
              </h3>
              <p className="mt-1 text-xs text-white/40">
                {artist.track_count} track{artist.track_count === 1 ? "" : "s"}
              </p>

              <label className="mt-4 block">
                <span className="sr-only">Upload image for {artist.name}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingId === artist.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(artist.id, file);
                    e.target.value = "";
                  }}
                  className="block w-full text-xs text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan-200"
                />
              </label>
              {uploadingId === artist.id && (
                <p className="mt-2 text-xs text-cyan-300/80">Uploading…</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
