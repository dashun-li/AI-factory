import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ai-video-factory/shared-types'],
  output: 'standalone',
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
