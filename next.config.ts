import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Produces .next/standalone for the Docker image (single self-contained server.js).
  output: 'standalone',
  // Native module: keep it out of the bundler and load it from node_modules at runtime.
  serverExternalPackages: ['better-sqlite3', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas', 'imapflow', 'mailparser'],
  poweredByHeader: false,
  experimental: {
    // Turbopack's persistent cache needs fsync, which the SMB-mounted dev checkout
    // doesn't support. A fresh Docker build gains nothing from it either.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default withNextIntl(nextConfig);
