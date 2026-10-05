import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@jp/core', '@jp/db', '@jp/ai'],
  // CV uploads go through a Server Action (max 5 MB file + multipart overhead).
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};

export default withNextIntl(nextConfig);
