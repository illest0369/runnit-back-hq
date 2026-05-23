/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/dashboard.html", destination: "/dashboard", permanent: false },
      { source: "/clip.html", destination: "/clip", permanent: false },
    ];
  },
};

module.exports = nextConfig;
