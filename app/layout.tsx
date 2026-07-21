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
  appleWebApp: {
    capable: true,
    title: "RithmGen",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/favicon_io/apple-touch-icon.png", sizes: "180x180" }],
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
      className={`${outfit.variable} ${spaceGrotesk.variable} dark overflow-x-clip antialiased`}
    >
      <body className="min-h-screen overflow-x-clip bg-[#07040f] font-[family-name:var(--font-body)] text-white">
        {children}
        <BroadcastShell />
      </body>
    </html>
  );
}
