import type { Metadata, Viewport } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import BroadcastShell from "@/components/BroadcastShell";
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

export const metadata: Metadata = {
  title: "80s Hit Radio — Non-Stop Classic Hits",
  description:
    "Stream classic hits and modern favorites across Pop, Rock, Hip-Hop, R&B, Electronic, and more.",
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
