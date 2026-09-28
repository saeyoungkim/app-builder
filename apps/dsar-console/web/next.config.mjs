/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared component library ships TypeScript source so tools stay on one version.
  transpilePackages: ["@paved/ui"],
};

export default nextConfig;
