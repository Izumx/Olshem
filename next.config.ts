import type { NextConfig } from 'next';

// Static export: every page is a client component and there is no backend,
// so the `out/` folder can be hosted anywhere or served offline.
const config: NextConfig = {
  reactStrictMode: true,
  output: 'export',
};

export default config;
