import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // Dev behind NPM / LAN host (HMR, /_next/*, websockets)
  allowedDevOrigins: [
    "workbuddy.rolfwalker.ch",
    "*.rolfwalker.ch",
    "192.168.5.105",
    "192.168.5.46",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: ["workbuddy.rolfwalker.ch", "*.rolfwalker.ch"],
    },
  },
};

export default nextConfig;
