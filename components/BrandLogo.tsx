import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  /** Visual size preset */
  size?: "sm" | "md" | "lg";
  /** Wrap in a home link */
  href?: string | null;
  className?: string;
  priority?: boolean;
};

/**
 * logo.jpg is 1152×768 with letterboxing — display heights must be large
 * so the wordmark itself stays clearly readable on phone and desktop.
 */
const SIZES = {
  sm: {
    width: 360,
    height: 240,
    className: "h-16 w-auto max-w-[min(100%,280px)] sm:h-[4.5rem]",
  },
  md: {
    width: 480,
    height: 320,
    className: "h-20 w-full max-w-none sm:h-24",
  },
  lg: {
    width: 640,
    height: 426,
    className: "h-24 w-full max-w-none sm:h-28",
  },
} as const;

export default function BrandLogo({
  size = "md",
  href = "/",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const dim = SIZES[size];
  const image = (
    <Image
      src="/logo.jpg"
      alt="RithmGen"
      width={dim.width}
      height={dim.height}
      priority={priority}
      sizes="(max-width: 640px) 280px, 360px"
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
