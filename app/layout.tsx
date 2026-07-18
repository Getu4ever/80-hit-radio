import type { Metadata, Viewport } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import BroadcastShell from "@/components/BroadcastShell";
import { PRODUCTION_APP_URL } from "@/lib/env";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const siteTitle = "RithmGen — 80s Hit Radio";
const siteDescription =
  "Non-stop classic hits and the RithmGen listener community. Stream Pop, Rock, Hip-Hop, R&B, Electronic, and more.";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_APP_URL),
  title: {
    default: siteTitle,
    template: "%s · RithmGen",
  },
  description: siteDescription,
  applicationName: "RithmGen",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: PRODUCTION_APP_URL,
    siteName: "RithmGen",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/logo/logo80b.jpg",
        width: 1248,
        height: 832,
        alt: "RithmGen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/logo/logo80b.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07040f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${spaceGrotesk.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-body)] bg-[#07040f] text-white">
        {children}
        <BroadcastShell />
      </body>
    </html>
  );
}
