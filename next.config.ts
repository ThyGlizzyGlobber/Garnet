import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Produces .next/standalone for the Docker image (single self-contained server.js).
  output: 'standalone',
  // Native module: keep it out of the bundler and load it from node_modules at runtime.
  serverExternalPackages: [
    'better-sqlite3',
    'pdf-parse',
    'pdfjs-dist',
    '@napi-rs/canvas',
    'mailparser',
  ],
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Invite links carry their token in the path; never leak it to other sites.
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      // Browsers ignore HSTS over plain http, so the LAN wall display is unaffected.
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    ];
    return [
      {
        // Archived bill files set their own framing and sandbox rules in the route.
        source: '/((?!api/documents/).*)',
        headers: [
          ...common,
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
      { source: '/api/documents/:path*', headers: common },
    ];
  },
  experimental: {
    // Bill uploads go through a server action; match the 25 MB check in the action.
    serverActions: { bodySizeLimit: '26mb' },
    // Turbopack's persistent cache needs fsync, which the SMB-mounted dev checkout
    // doesn't support. A fresh Docker build gains nothing from it either.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default withNextIntl(nextConfig);
