"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserSession } from "@/hooks/useUserSession";
import BrandLogo from "@/components/BrandLogo";
import VoiceAssistant from "@/components/VoiceAssistant";

function UserIcon({ className }: { className?: string }) {
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
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
      />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 10l5 5 5-5H7z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ClearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

type HeaderProps = {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
};

export default function Header({
  searchQuery = "",
  onSearchChange,
}: HeaderProps) {
  const router = useRouter();
  const { user, isLoggedIn, isAdmin, signOut } = useUserSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        left: rect.right,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      await signOut();
    } catch {
      router.push("/");
      router.refresh();
    }
  };

  const menu =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: Math.max(menuPosition.width, 208),
            }}
            className="fixed z-[120] -translate-x-full overflow-hidden rounded-xl border border-white/10 bg-[#0a0614]/95 py-1 shadow-[0_0_24px_rgba(0,0,0,0.5),0_0_20px_rgba(217,70,239,0.12)] backdrop-blur-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Link
              href="/dashboard/profile"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2.5 text-sm text-white/80 transition hover:bg-cyan-400/10 hover:text-cyan-300"
            >
              Listener Lounge
            </Link>
            <Link
              href="/help"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2.5 text-sm text-white/80 transition hover:bg-cyan-400/10 hover:text-cyan-300"
            >
              Help & support
            </Link>
            {isAdmin && (
              <Link
                href="/dashboard/admin"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-white/80 transition hover:bg-cyan-400/10 hover:text-cyan-300"
              >
                Studio Control
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void handleSignOut();
              }}
              className="block w-full px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-fuchsia-500/10 hover:text-fuchsia-300"
            >
              Sign Out
            </button>
          </div>,
          document.body,
        )
      : null;

  const authControls = !isLoggedIn ? (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/auth/login"
        className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 transition hover:border-cyan-400/35 hover:bg-white/[0.07] hover:text-white sm:px-4 sm:py-2.5 sm:text-sm"
      >
        Sign In
      </Link>
      <Link
        href="/auth/signup"
        className="inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-[0_0_24px_rgba(217,70,239,0.45),0_0_40px_rgba(34,211,238,0.25)] transition hover:brightness-110 hover:shadow-[0_0_32px_rgba(217,70,239,0.55),0_0_48px_rgba(34,211,238,0.35)] sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <span className="sm:hidden">Free trial</span>
        <span className="hidden sm:inline">Start Free Trial</span>
      </Link>
    </div>
  ) : (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="flex items-center gap-2 rounded-full border border-cyan-400/30 bg-white/[0.04] py-1.5 pl-1.5 pr-2.5 transition hover:border-fuchsia-400/40 hover:bg-white/[0.07] sm:pr-3"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-fuchsia-500/80 to-cyan-400/80 text-[#0a0614] shadow-[0_0_12px_rgba(34,211,238,0.35)]">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <UserIcon className="h-4 w-4" />
          )}
        </span>
        <span className="hidden max-w-[8rem] truncate text-sm text-white/80 sm:inline">
          {user?.displayName}
        </span>
        <ChevronIcon
          className={`h-4 w-4 text-white/40 transition ${
            menuOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {menu}
    </div>
  );

  const searchForm = onSearchChange ? (
    <form
      role="search"
      className="relative min-w-0 w-full flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        searchRef.current?.blur();
      }}
    >
      <label htmlFor="catalog-search" className="sr-only">
        Search songs, artists, or years
      </label>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/70 sm:left-3.5 sm:h-5 sm:w-5" />
      <input
        ref={searchRef}
        id="catalog-search"
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search song, artist, year…"
        autoComplete="off"
        enterKeyHint="search"
        className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 pl-10 pr-[4.75rem] text-sm text-white placeholder:text-white/35 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] outline-none transition focus:border-cyan-400/45 focus:bg-white/[0.07] focus:shadow-[0_0_20px_rgba(34,211,238,0.12)] sm:py-3 sm:pl-11 sm:pr-32 sm:text-base"
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 sm:right-2 sm:gap-1">
        <VoiceAssistant onSearchQuery={onSearchChange} />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              searchRef.current?.focus();
            }}
            className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white"
            aria-label="Clear search"
          >
            <ClearIcon className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/35 sm:inline">
            ⌘K
          </kbd>
        )}
        <button
          type="submit"
          className="rounded-lg bg-cyan-400/15 p-1.5 text-cyan-300 transition hover:bg-cyan-400/25 sm:px-2.5 sm:py-1.5 sm:text-xs sm:font-semibold sm:uppercase sm:tracking-wider"
          aria-label="Search"
        >
          <SearchIcon className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>
    </form>
  ) : null;

  return (
    <div className="relative z-[80] mb-5 overflow-x-hidden animate-fade-up sm:mb-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 [contain:layout] lg:flex lg:gap-4">
        <div className="min-w-0 shrink-0 lg:hidden">
          <BrandLogo size="header" priority />
        </div>

        <div className="col-start-2 row-start-1 shrink-0 lg:order-2">
          {authControls}
        </div>

        {searchForm ? (
          <div className="col-span-2 min-w-0 lg:order-1 lg:col-auto lg:flex-1">
            {searchForm}
          </div>
        ) : null}
      </div>
    </div>
  );
}
