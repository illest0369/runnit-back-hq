/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ensure config/ and data/ files are included in the serverless function bundle
    outputFileTracingIncludes: {
      '/api/*': ['./config/**/*', './data/**/*.json'],
    },
  },
};

module.exports = nextConfig;
