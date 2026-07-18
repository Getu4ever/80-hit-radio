"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserSession } from "@/hooks/useUserSession";
import { useAudioStore } from "@/store/useAudioStore";
import BrandLogo from "@/components/BrandLogo";

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
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const { isAdmin, signOut, user } = useUserSession();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  const links = [
    { href: "/", label: "On Air" },
    { href: "/dashboard/profile", label: "Listener Lounge" },
    { href: "/help", label: "Help" },
    ...(isAdmin
      ? [{ href: "/dashboard/admin", label: "Studio Control" }]
      : []),
  ];

  return (
    <header className="mb-10 animate-fade-up">
      <div className="mb-5">
        <BrandLogo size="lg" href="/" />
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/70">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300 sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-xl text-sm text-white/50">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-sm">
        <LiveDot active={Boolean(currentTrack && isPlaying)} />
        <p className="text-sm text-white/70">
          {currentTrack ? (
            <>
              <span className="text-white/40">Broadcast continues · </span>
              <span className="text-cyan-200">
                {currentTrack.artist} — {currentTrack.title}
              </span>
            </>
          ) : (
            <span className="text-white/45">
              No track on air — start radio from the home deck, it will keep
              playing here until you sign out.
            </span>
          )}
        </p>
        {user && (
          <p className="ml-auto truncate text-xs text-white/35">
            {user.displayName}
            <span className="text-white/20"> · </span>
            {user.email}
          </p>
        )}
      </div>
    </header>
  );
}
