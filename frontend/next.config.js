/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://lucky-adjusted-possum.ngrok-free.app/:path*',
      },
    ];
  },
};

module.exports = nextConfig;