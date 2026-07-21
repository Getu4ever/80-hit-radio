import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RithmGen — 80s Hit Radio",
    short_name: "RithmGen",
    description:
      "Non-stop classic 80s hits. Stream Pop, Rock, Hip-Hop, R&B, Electronic, and more.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07040f",
    theme_color: "#07040f",
    categories: ["music", "entertainment"],
    icons: [
      {
        src: "/favicon_io/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon_io/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon_io/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
