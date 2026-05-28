import type { NextConfig } from 'next'
import os from 'os'

// Detect every non-loopback IPv4 address on the host at startup time.
// This lets Next.js dev server accept HMR connections from LAN devices
// (phones, team PCs) without hardcoding IPs that change per network.
function getLanIps(): string[] {
  const ips: string[] = []
  for (const nets of Object.values(os.networkInterfaces())) {
    if (!nets) continue
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

const IS_STATIC_BUILD =
  process.env['ELECTRON_BUILD'] === '1' || process.env['STATIC_EXPORT'] === '1'

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'http://localhost:3002'

const nextConfig: NextConfig = {
  output: IS_STATIC_BUILD ? 'export' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: getLanIps(),
  eslint: {
    ignoreDuringBuilds: true,
  },
  // In dev (not a static export), proxy API calls through the Next.js server so
  // the browser sees same-origin requests — this is what makes session cookies work.
  // WebSockets (Socket.IO) can't be proxied this way; the socket store connects directly.
  async rewrites() {
    if (IS_STATIC_BUILD) return []
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND_URL}/uploads/:path*` },
    ]
  },
}

export default nextConfig
