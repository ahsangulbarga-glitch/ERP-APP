import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence Turbopack/webpack mismatch warning
  turbopack: {},
  // @react-pdf/renderer needs canvas stubbed out on the server (webpack fallback)
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'canvas']
    }
    return config
  },
};

export default nextConfig;
