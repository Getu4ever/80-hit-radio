"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserSession } from "@/hooks/useUserSession";

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

export default function Header() {
  const router = useRouter();
  const { user, isLoggedIn, isAdmin, signOut } = useUserSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative z-[80] mb-6 flex items-center justify-end animate-fade-up sm:mb-8">
      {!isLoggedIn ? (
        <Link
          href="/auth/signup"
          className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(217,70,239,0.45),0_0_40px_rgba(34,211,238,0.25)] transition hover:brightness-110 hover:shadow-[0_0_32px_rgba(217,70,239,0.55),0_0_48px_rgba(34,211,238,0.35)] sm:px-5"
        >
          Sign In / Start Free Month
        </Link>
      ) : (
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-full border border-cyan-400/30 bg-white/[0.04] py-1.5 pl-1.5 pr-3 transition hover:border-fuchsia-400/40 hover:bg-white/[0.07]"
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
      )}
    </div>
  );
}
