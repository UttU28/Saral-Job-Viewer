/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  env: {
    // Default to localhost in development
    API_URL: process.env.API_URL || 'https://lucky-adjusted-possum.ngrok-free.app',
  },
};

module.exports = nextConfig;