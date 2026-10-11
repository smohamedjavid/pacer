import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pnpm workspace root, so tracing finds hoisted dependencies.
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  // The SDK ships TypeScript source (ESM with `.js` specifiers) straight from the workspace.
  transpilePackages: ['@pacer/sdk'],
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
