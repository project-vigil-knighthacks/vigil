import type { NextConfig } from "next";

const backendUrl = process.env.VIGIL_BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // WebSocket proxy (route handlers can't do WS upgrades)
      { source: '/ws/:path*', destination: `${backendUrl}/ws/:path*` },
    ];
  },
};

export default nextConfig;
