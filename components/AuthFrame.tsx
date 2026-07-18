import { type ReactNode } from "react";
import BrandLogo from "@/components/BrandLogo";

type AuthFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  info?: string | null;
  error?: string | null;
  hint?: string | null;
  mobileHero?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export default function AuthFrame({
  eyebrow,
  title,
  description,
  info,
  error,
  hint,
  mobileHero,
  footer,
  children,
}: AuthFrameProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center overflow-x-hidden overscroll-none bg-[#07040f] px-4 py-6 text-white scrollbar-none">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#0a0614]/90 p-6 shadow-[0_0_24px_rgba(34,211,238,0.1)] sm:p-8 sm:shadow-[0_0_40px_rgba(34,211,238,0.12)]">
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/40 px-3 py-3">
          <BrandLogo size="lg" href="/" />
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-cyan-300/90">
            80s Hit Radio
          </p>
        </div>

        {mobileHero && <div className="mb-6 lg:hidden">{mobileHero}</div>}

        <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/70">{eyebrow}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-300">
          {title}
        </h1>
        <p className="mt-2 text-sm text-white/50">{description}</p>

        {hint ? (
          <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            {hint}
          </p>
        ) : null}

        {info ? (
          <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            {info}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
            {error}
          </p>
        ) : null}

        <div className="mt-8">{children}</div>

        {footer ? <div className="mt-6 border-t border-white/10 pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}
