/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: 'dist/panel',
  typescript: {
    tsconfigPath: './tsconfig.panel.json',
  },
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
};

module.exports = nextConfig;
