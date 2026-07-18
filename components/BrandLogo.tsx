import Image from "next/image";
import Link from "next/link";

/**
 * Always use public/logo/logo80b.jpg — only display size changes by preset.
 */
const SIZES = {
  /** Mobile top-bar mark — keep clearly readable on phones */
  header: {
    width: 420,
    height: 280,
    className: "h-14 w-auto max-w-[200px] sm:h-16 sm:max-w-[240px]",
  },
  sm: {
    width: 420,
    height: 280,
    className: "h-20 w-auto max-w-[min(100%,280px)] sm:h-24",
  },
  md: {
    width: 560,
    height: 373,
    className: "h-24 w-auto max-w-[min(100%,320px)] sm:h-28",
  },
  lg: {
    width: 720,
    height: 480,
    className: "h-32 w-auto max-w-[min(100%,420px)] sm:h-40 sm:max-w-[520px]",
  },
  /** Billing / branded dashboard hero mark */
  xl: {
    width: 900,
    height: 600,
    className: "h-40 w-auto max-w-[min(100%,520px)] sm:h-52 sm:max-w-[640px]",
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
      sizes="(max-width: 640px) 420px, 640px"
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
