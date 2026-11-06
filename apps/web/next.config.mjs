/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@termix/shared'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
