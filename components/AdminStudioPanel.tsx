"use client";

import { useState } from "react";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminCatalog from "@/components/admin/AdminCatalog";
import AdminArtists from "@/components/admin/AdminArtists";
import AdminListeners from "@/components/admin/AdminListeners";

type AdminTab = "overview" | "catalog" | "artists" | "listeners";

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "catalog", label: "Catalog" },
  { id: "artists", label: "Artists" },
  { id: "listeners", label: "Listeners" },
];

export default function AdminStudioPanel() {
  const [tab, setTab] = useState<AdminTab>("overview");

  return (
    <div className="animate-fade-up space-y-6">
      <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition ${
              tab === item.id
                ? "bg-gradient-to-r from-fuchsia-600/90 to-cyan-500/90 text-white"
                : "text-white/50 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <AdminOverview />}
      {tab === "catalog" && <AdminCatalog />}
      {tab === "artists" && <AdminArtists />}
      {tab === "listeners" && <AdminListeners />}
    </div>
  );
}
