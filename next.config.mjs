const nextConfig = {
  serverExternalPackages: ['bullmq', 'ioredis', 'execa', 'uuid'],
  experimental: {
    webpackBuildWorker: false,
  },
}

export default nextConfig
