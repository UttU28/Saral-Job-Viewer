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
        destination: 'https://2a12-73-206-193-141.ngrok-free.app/:path*',
      },
    ];
  },
};

module.exports = nextConfig;