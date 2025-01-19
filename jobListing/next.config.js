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
        destination: 'http://94fa-73-206-193-141.ngrok-free.app/:path*',
      },
    ];
  },
};

module.exports = nextConfig;