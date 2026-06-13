import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence Turbopack/webpack mismatch warning
  turbopack: {},
  // Increase API body size limit for logo/letterhead uploads (base64 images)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // @react-pdf/renderer needs canvas stubbed out on the server (webpack fallback)
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'canvas']
    }
    return config
  },
};

export default nextConfig;
