"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserSession } from "@/hooks/useUserSession";
import { useAudioStore } from "@/store/useAudioStore";
import BrandLogo from "@/components/BrandLogo";
import ShareStation from "@/components/ShareStation";

function LiveDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        active
          ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)] animate-viz-pulse"
          : "bg-white/25"
      }`}
      aria-hidden
    />
  );
}

export default function DashboardChrome({
  title,
  eyebrow,
  subtitle,
  logoSize = "sm",
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  logoSize?: "sm" | "md" | "lg" | "xl";
}) {
  const pathname = usePathname();
  const { isAdmin, signOut } = useUserSession();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  const links = [
    { href: "/", label: "On Air" },
    { href: "/dashboard/profile", label: "Listener Lounge" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/help", label: "Help" },
    ...(isAdmin
      ? [{ href: "/dashboard/admin", label: "Studio Control" }]
      : []),
  ];

  const largeLogo = logoSize === "lg" || logoSize === "xl";

  return (
    <header className="mb-6 animate-fade-up">
      {largeLogo && (
        <div className="mb-5">
          <BrandLogo size={logoSize} href="/" priority />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {!largeLogo && <BrandLogo size={logoSize} href="/" />}
          <p
            className={`${largeLogo ? "mt-0" : "mt-3"} text-xs uppercase tracking-[0.35em] text-cyan-400/70`}
          >
            {eyebrow}
          </p>
          <h1 className="mt-1.5 font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300 sm:text-[2.35rem] sm:leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/50">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:pt-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-4 py-2 text-sm transition ${
                  active
                    ? "border border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                    : "border border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-sm text-fuchsia-200 transition hover:bg-fuchsia-500/20"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <LiveDot active={Boolean(currentTrack && isPlaying)} />
          <p className="min-w-0 text-sm text-white/70">
            {currentTrack ? (
              <>
                <span className="text-white/40">Broadcast continues · </span>
                <span className="text-cyan-200">
                  {currentTrack.artist} — {currentTrack.title}
                </span>
              </>
            ) : (
              <span className="text-white/45">
                No track on air — tune in from the home deck; it keeps playing
                here until you sign out.
              </span>
            )}
          </p>
        </div>
        <ShareStation variant="lounge" className="shrink-0" />
      </div>
    </header>
  );
}
