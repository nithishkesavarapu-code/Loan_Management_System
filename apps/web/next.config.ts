import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const rawOrigin = (process.env.API_ORIGIN?.trim() || 'http://127.0.0.1:4000').replace(/\/+$/, '');
const apiOrigin = rawOrigin;
const parsedOrigin = new URL(apiOrigin);
if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== apiOrigin) {
  throw new Error('API_ORIGIN must be an HTTP(S) origin without a path or trailing slash.');
}

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@lms/shared'],
  turbopack: { root: resolve(process.cwd(), '../..') },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
