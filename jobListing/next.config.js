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
        destination: 'http://cbf4-2603-7080-2b3c-2cff-00-1bd6.ngrok-free.app/:path*',
      },
    ];
  },
};

module.exports = nextConfig;