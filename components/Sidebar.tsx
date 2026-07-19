"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Survives React Strict Mode remounts within the same page load.
 * Never read localStorage in useState — that causes SSR/client mismatches.
 * null = not restored yet → UI stays collapsed for the first paint.
 */
let rememberedExpanded: boolean | null = null;

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
      className={`${className ?? ""} ${
        expanded ? "rotate-180" : "rotate-0"
      } transition-transform duration-300 ease-in-out`}
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

function readStoredExpanded(fallbackFilter: NavFilter): boolean {
  if (rememberedExpanded !== null) return rememberedExpanded;
  try {
    const stored = localStorage.getItem(MORE_GENRES_STORAGE_KEY);
    if (stored === "true") rememberedExpanded = true;
    else if (stored === "false") rememberedExpanded = false;
    else {
      rememberedExpanded = MORE_GENRES.includes(fallbackFilter as Subgenre);
    }
  } catch {
    rememberedExpanded = MORE_GENRES.includes(fallbackFilter as Subgenre);
  }
  return rememberedExpanded;
}

function persistExpanded(next: boolean) {
  rememberedExpanded = next;
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
  const initialFilterRef = useRef(filter);

  // First paint / SSR: always collapsed. After restore, module cache keeps
  // Strict Mode remounts from snapping closed (the open→collapse flash).
  const [isExpanded, setIsExpanded] = useState(
    () => rememberedExpanded ?? false,
  );
  /** Transitions off until restore settles — avoids animating open on refresh. */
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    const next = readStoredExpanded(initialFilterRef.current);
    setIsExpanded(next);
    const id = window.requestAnimationFrame(() => {
      setMotionReady(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!motionReady) return;
    if (!MORE_GENRES.includes(filter as Subgenre)) return;
    setIsExpanded((prev) => {
      if (prev) return prev;
      persistExpanded(true);
      return true;
    });
  }, [filter, motionReady]);

  const toggleMore = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      persistExpanded(next);
      return next;
    });
  };

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
          className={`flex min-h-0 flex-1 flex-col gap-1 pb-24 ${
            isExpanded
              ? "overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-sidebar"
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

          {/* Always mounted — CSS collapse only. No {isExpanded && …} remount flash. */}
          <div
            className={`overflow-hidden ${
              motionReady ? "transition-all duration-300 ease-in-out" : ""
            } ${isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
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
