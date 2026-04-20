/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure config/ and outputs/ and data/ files are included in the serverless function bundle
  outputFileTracingIncludes: {
    '/api/*': ['./config/**/*', './outputs/**/*.json', './data/**/*.json'],
  },
};

module.exports = nextConfig;
