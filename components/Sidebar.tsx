"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MORE_GENRES,
  POPULAR_GENRES,
  type Subgenre,
} from "@/data/tracks";
import { useUserSession } from "@/hooks/useUserSession";
import { useStreamAccessStore } from "@/store/useStreamAccessStore";
import BrandLogo from "@/components/BrandLogo";

export type NavFilter = "All" | Subgenre;

interface SidebarProps {
  filter: NavFilter;
  onFilterChange: (filter: NavFilter) => void;
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 12l1.8 1.8L15 10"
      />
    </svg>
  );
}

function ChevronIcon({
  className,
  expanded,
}: {
  className?: string;
  expanded: boolean;
}) {
  return (
    <svg
      className={`${className ?? ""} transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function GenreButton({
  item,
  active,
  onSelect,
  disabled = false,
}: {
  item: NavFilter;
  active: boolean;
  onSelect: (filter: NavFilter) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      disabled={disabled}
      className={`rounded-lg px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-cyan-400/10 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
          : "text-white/50 hover:bg-white/5 hover:text-white/80 disabled:hover:bg-transparent disabled:hover:text-white/50"
      }`}
    >
      {item}
    </button>
  );
}

export default function Sidebar({
  filter,
  onFilterChange,
}: SidebarProps) {
  const { isAdmin, subscriptionLabel } = useUserSession();
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);
  const controlsDisabled = !streamingAllowed;
  const [showMore, setShowMore] = useState(false);
  const moreOpen =
    showMore || MORE_GENRES.includes(filter as Subgenre);

  return (
    <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col self-start overflow-hidden border-r border-white/10 bg-[#0a0614]/80 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] pt-8 backdrop-blur-md lg:flex">
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="mb-6 w-full shrink-0">
          <BrandLogo size="lg" priority />
          {subscriptionLabel && (
            <p className="mt-3 inline-flex rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-medium tracking-wide text-cyan-300/90 shadow-[0_0_12px_rgba(34,211,238,0.15)]">
              {subscriptionLabel}
            </p>
          )}
        </div>

        <nav
          className="scrollbar-sidebar flex h-[calc(100vh-220px)] flex-col gap-1 overflow-y-scroll overscroll-contain pb-16"
          aria-label="Genres"
        >
          <GenreButton
            item="All"
            active={filter === "All"}
            onSelect={onFilterChange}
            disabled={controlsDisabled}
          />
          {POPULAR_GENRES.map((item) => (
            <GenreButton
              key={item}
              item={item}
              active={filter === item}
              onSelect={onFilterChange}
              disabled={controlsDisabled}
            />
          ))}

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={moreOpen}
            disabled={controlsDisabled}
            className="mt-1 flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-white/40 transition hover:bg-white/5 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/40"
          >
            More genres
            <ChevronIcon className="h-3.5 w-3.5" expanded={moreOpen} />
          </button>

          {moreOpen &&
            MORE_GENRES.map((item) => (
              <GenreButton
                key={item}
                item={item}
                active={filter === item}
                onSelect={(next) => {
                  setShowMore(true);
                  onFilterChange(next);
                }}
                disabled={controlsDisabled}
              />
            ))}
        </nav>

        {isAdmin && (
          <div className="mt-auto shrink-0 px-2 pt-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/5 py-2.5 text-xs font-semibold uppercase tracking-widest text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:shadow-[0_0_16px_rgba(34,211,238,0.2)]"
            >
              <ShieldIcon className="h-3.5 w-3.5" />
              Admin Studio
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
