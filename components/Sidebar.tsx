"use client";

import { useEffect, useState } from "react";
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

const MORE_GENRES_STORAGE_KEY = "sidebar_more_genres";

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

function persistExpanded(next: boolean) {
  try {
    localStorage.setItem(MORE_GENRES_STORAGE_KEY, next ? "true" : "false");
  } catch {
    // Private mode / blocked storage — ignore.
  }
}

export default function Sidebar({
  filter,
  onFilterChange,
}: SidebarProps) {
  const { isAdmin, subscriptionLabel } = useUserSession();
  const streamingAllowed = useStreamAccessStore((s) => s.allowed);
  const controlsDisabled = !streamingAllowed;

  /**
   * Flash-free More genres:
   * - Never emit MORE_GENRES in SSR HTML (clientReady gate).
   * - Always mount collapsed; never auto-open from localStorage on cold load.
   * - Enable height/opacity transitions only after the first paint settles.
   */
  const [clientReady, setClientReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
    // Drop stale "force open on refresh" flags from earlier builds.
    try {
      if (localStorage.getItem(MORE_GENRES_STORAGE_KEY) === "true") {
        localStorage.setItem(MORE_GENRES_STORAGE_KEY, "false");
      }
    } catch {
      // ignore
    }
    const id = window.requestAnimationFrame(() => {
      setMotionReady(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    if (!MORE_GENRES.includes(filter as Subgenre)) return;
    setIsExpanded(true);
  }, [clientReady, filter]);

  const toggleMore = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      persistExpanded(next);
      return next;
    });
  };

  return (
    <aside className="desktop-sidebar sticky top-0 hidden h-dvh w-80 shrink-0 flex-col self-start overflow-hidden border-r border-white/10 bg-[#0a0614]/80 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] pt-8 backdrop-blur-md lg:flex">
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
          className={`flex h-[calc(100vh-220px)] flex-col gap-1 overscroll-contain pb-16 ${
            isExpanded
              ? "scrollbar-sidebar overflow-y-scroll"
              : "overflow-hidden"
          }`}
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
            onClick={toggleMore}
            aria-expanded={isExpanded}
            disabled={controlsDisabled}
            className="mt-1 flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-white/40 transition hover:bg-white/5 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/40"
          >
            More genres
            <ChevronIcon className="h-3.5 w-3.5" expanded={isExpanded} />
          </button>

          {clientReady ? (
            <div
              className={`sidebar-more-panel flex flex-col gap-1 overflow-hidden ${
                motionReady
                  ? "transition-[max-height,opacity] duration-300 ease-in-out"
                  : ""
              }`}
              data-expanded={isExpanded ? "true" : "false"}
              style={{
                maxHeight: isExpanded ? 500 : 0,
                opacity: isExpanded ? 1 : 0,
              }}
              aria-hidden={!isExpanded}
            >
              <div
                className={`flex flex-col gap-1 ${
                  isExpanded ? "" : "pointer-events-none"
                }`}
              >
                {MORE_GENRES.map((item) => (
                  <GenreButton
                    key={item}
                    item={item}
                    active={filter === item}
                    onSelect={(next) => {
                      setIsExpanded(true);
                      persistExpanded(true);
                      onFilterChange(next);
                    }}
                    disabled={controlsDisabled}
                  />
                ))}
              </div>
            </div>
          ) : null}
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
