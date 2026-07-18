"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildNetworkShareUrls,
  buildSharePayload,
  canUseNativeShare,
  type ShareTrack,
} from "@/lib/share";

function IconShare({ className }: { className?: string }) {
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
        d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"
      />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

type ShareStationProps = {
  variant?: "on-air" | "lounge";
  track?: ShareTrack | null;
  /** Compact icon control for the player bar */
  compact?: boolean;
  className?: string;
};

export default function ShareStation({
  variant = "on-air",
  track = null,
  compact = false,
  className = "",
}: ShareStationProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    placeAbove: true,
  });

  const payload = buildSharePayload(track, variant);
  const networks = buildNetworkShareUrls(payload);
  const label = variant === "lounge" ? "Invite a friend" : "Share";

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 220;
      const left = Math.min(
        Math.max(12, rect.right - menuWidth),
        window.innerWidth - menuWidth - 12,
      );
      const placeAbove = rect.top > window.innerHeight * 0.45;
      setMenuPosition({
        top: placeAbove ? rect.top - 8 : rect.bottom + 8,
        left,
        width: menuWidth,
        placeAbove,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(payload.url);
      setCopied(true);
    } catch {
      const input = document.createElement("input");
      input.value = payload.url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
    }
  };

  const handleShare = async () => {
    if (canUseNativeShare()) {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          url: payload.url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Fall through to the quiet desktop-style menu.
      }
    }
    setOpen((value) => !value);
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Share options"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              transform: menuPosition.placeAbove
                ? "translateY(-100%)"
                : undefined,
            }}
            className="fixed z-[130] overflow-hidden rounded-xl border border-cyan-400/20 bg-[#0a0614]/96 py-1 shadow-[0_0_28px_rgba(0,0,0,0.55),0_0_18px_rgba(34,211,238,0.12)] backdrop-blur-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/55">
              Share the station
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void copyLink();
              }}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm text-white/85 transition hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              <span>{copied ? "Link copied" : "Copy link"}</span>
              {copied ? (
                <IconCheck className="h-4 w-4 text-cyan-300" />
              ) : null}
            </button>
            <a
              href={networks.x}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-sm text-white/80 transition hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              Post on X
            </a>
            <a
              href={networks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-sm text-white/80 transition hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              Share on Facebook
            </a>
            <a
              href={networks.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-sm text-white/80 transition hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              Send on WhatsApp
            </a>
          </div>,
          document.body,
        )
      : null;

  if (compact) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            void handleShare();
          }}
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-haspopup="menu"
          title={label}
          className={`rounded-full p-2 text-white/65 transition hover:bg-white/10 hover:text-cyan-300 ${className}`}
        >
          <IconShare className="h-5 w-5" />
        </button>
        {menu}
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          void handleShare();
        }}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-400/15 ${className}`}
      >
        <IconShare className="h-4 w-4" />
        <span>{label}</span>
      </button>
      {menu}
    </>
  );
}
