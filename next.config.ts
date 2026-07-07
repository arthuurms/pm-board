import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack — next-auth v4 has issues with it in Next.js 16
  experimental: {},
};

export default nextConfig;
