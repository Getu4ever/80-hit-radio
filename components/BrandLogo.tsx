import Image from "next/image";
import Link from "next/link";

/**
 * logo80b.jpg — display heights stay large so the wordmark
 * remains clearly readable on phone and desktop.
 */
const SIZES = {
  /** Compact mark for the mobile top bar */
  header: {
    width: 280,
    height: 187,
    className: "h-10 w-auto max-w-[148px] sm:h-12 sm:max-w-[180px]",
  },
  sm: {
    width: 420,
    height: 280,
    className: "h-16 w-auto max-w-[min(100%,240px)] sm:h-20 sm:max-w-[280px]",
  },
  md: {
    width: 560,
    height: 373,
    className: "h-20 w-auto max-w-[min(100%,280px)] sm:h-24 sm:max-w-[320px]",
  },
  lg: {
    width: 720,
    height: 480,
    className: "h-28 w-full max-w-none sm:h-36",
  },
} as const;

type BrandLogoProps = {
  /** Visual size preset */
  size?: keyof typeof SIZES;
  /** Wrap in a home link */
  href?: string | null;
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({
  size = "md",
  href = "/",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const dim = SIZES[size];
  const image = (
    <Image
      src="/logo/logo80b.jpg"
      alt="RithmGen"
      width={dim.width}
      height={dim.height}
      priority={priority}
      sizes="(max-width: 640px) 320px, 420px"
      className={`${dim.className} object-contain object-left ${className}`}
    />
  );

  if (!href) return image;

  return (
    <Link
      href={href}
      className="inline-flex w-full max-w-full items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0614] rounded-md"
      aria-label="RithmGen home"
    >
      {image}
    </Link>
  );
}
