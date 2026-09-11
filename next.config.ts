import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // Keep only true server-only packages here. Listing pino/thread-stream
  // breaks Privy/Reown client bundles (version mismatch warnings + SSR issues).
  serverExternalPackages: ["postgres", "ioredis", "drizzle-orm"],
  transpilePackages: ["@privy-io/react-auth", "@privy-io/server-auth"],
  turbopack: {
    // Avoid picking parent Documents/package-lock.json as workspace root
    root: path.join(__dirname),
  },
}

export default nextConfig
