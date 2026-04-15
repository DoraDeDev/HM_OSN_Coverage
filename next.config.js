/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',           // Required for Docker multi-stage build
  transpilePackages: [
    'mapbox-gl',
    'deck.gl',
    '@deck.gl/core',
    '@deck.gl/react',
    '@deck.gl/layers',
    '@deck.gl/aggregation-layers',
    '@deck.gl/geo-layers',
    '@deck.gl/extensions',
    '@vis.gl/react-mapbox',
    'react-map-gl',
    '@math.gl/core',
    '@math.gl/web-mercator',
  ],
  // Keep snowflake-sdk (and ioredis) out of the webpack bundle — they rely on
  // native Node.js APIs that cannot be bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ['snowflake-sdk', 'ioredis'],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      dns: false,
      child_process: false,
    };
    return config;
  },
};

module.exports = nextConfig;
