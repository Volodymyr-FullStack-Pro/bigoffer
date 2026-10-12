import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@jp/core', '@jp/db', '@jp/ai'],
  // The dev-mode "N" badge sits in the bottom-left corner over the Offer Genie (and its e2e clicks).
  devIndicators: false,
};

export default withNextIntl(nextConfig);
