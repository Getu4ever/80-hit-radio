"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { SUBGENRES, type Subgenre, type Track } from "@/data/tracks";

export default function AdminCatalog() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [source, setSource] = useState<"database" | "static">("static");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState<Subgenre | "all">("all");
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState(1985);
  const [youtubeId, setYoutubeId] = useState("");
  const [subgenre, setSubgenre] = useState<Subgenre>("Pop");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tracks", { credentials: "include" });
      if (!res.ok) {
        setError("Failed to load catalog");
        return;
      }
      const data = (await res.json()) as {
        tracks: Track[];
        source: "database" | "static";
      };
      setTracks(data.tracks);
      setSource(data.source);
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
    return tracks.filter((track) => {
      if (genreFilter !== "all" && track.subgenre !== genreFilter) return false;
      if (!q) return true;
      return (
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        track.youtubeId.toLowerCase().includes(q)
      );
    });
  }, [tracks, query, genreFilter]);

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tracks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      if (!res.ok) {
        setError("Import failed");
        return;
      }
      await load();
    } finally {
      setSeeding(false);
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tracks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist, year, youtubeId, subgenre }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to add track");
        return;
      }
      setTitle("");
      setArtist("");
      setYoutubeId("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(track: Track) {
    if (source !== "database") {
      setError("Import the catalog to the database before deleting tracks.");
      return;
    }
    if (!window.confirm(`Delete “${track.title}” by ${track.artist}?`)) return;

    setError(null);
    const res = await fetch(`/api/admin/tracks?id=${encodeURIComponent(track.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setError("Delete failed");
      return;
    }
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
  }

  if (loading) {
    return <p className="text-sm text-white/50">Loading catalog…</p>;
  }

  return (
    <div className="space-y-8">
      {source === "static" && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5">
          <p className="text-sm text-amber-100/90">
            The catalog is still read-only from bundled JSON. Import it to the
            database to add, delete, and manage tracks from this panel.
          </p>
          <button
            type="button"
            onClick={() => void handleSeed()}
            disabled={seeding}
            className="mt-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {seeding ? "Importing…" : "Import catalog to database"}
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/70">
          New master
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
          Add a track
        </h2>

        <form onSubmit={handleAdd} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-white/70">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            Artist
            <input
              required
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            Year
            <input
              required
              type="number"
              min={1980}
              max={1989}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            YouTube ID
            <input
              required
              value={youtubeId}
              onChange={(e) => setYoutubeId(e.target.value)}
              placeholder="11-character video ID"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70 sm:col-span-2">
            Genre
            <select
              value={subgenre}
              onChange={(e) => setSubgenre(e.target.value as Subgenre)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-white"
            >
              {SUBGENRES.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add track"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Catalog roster
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
              {tracks.length} tracks · {source}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, artist, or YouTube ID…"
            className="min-w-[12rem] flex-1 rounded-xl border border-white/10 bg-[#0a0614] px-4 py-2.5 text-sm text-white placeholder:text-white/30"
          />
          <select
            value={genreFilter}
            onChange={(e) =>
              setGenreFilter(e.target.value as Subgenre | "all")
            }
            className="rounded-xl border border-white/10 bg-[#0a0614] px-3 py-2.5 text-sm text-white"
          >
            <option value="all">All genres</option>
            {SUBGENRES.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mt-3 text-xs text-fuchsia-300">{error}</p>}

        <div className="mt-5 max-h-[28rem] overflow-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-white/10 bg-[#0a0614] text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">Track</th>
                <th className="px-4 py-3 font-medium">Genre</th>
                <th className="px-4 py-3 font-medium">YouTube</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((track) => (
                <tr
                  key={track.id}
                  className="border-b border-white/5 text-white/80 last:border-0"
                >
                  <td className="px-4 py-3">
                    <p>{track.title}</p>
                    <p className="text-xs text-white/40">
                      {track.artist} · {track.year}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-white/50">{track.subgenre}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/40">
                    {track.youtubeId}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(track)}
                      disabled={source !== "database"}
                      className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-white/40"
                  >
                    No tracks match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <p className="mt-2 text-xs text-white/35">
            Showing first 200 of {filtered.length} matches. Refine your search to
            find more.
          </p>
        )}
      </section>
    </div>
  );
}
