import type { MetadataRoute } from "next";
import { BRAND, BRAND_TAGLINE } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.app,
    short_name: BRAND.app,
    description: BRAND_TAGLINE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: BRAND.microsoft,
        short_name: "Microsoft",
        url: "/microsoft",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: BRAND.google,
        short_name: "Google",
        url: "/google",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: BRAND.maringo,
        short_name: "Maringo",
        url: "/maringo",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
