/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin, settings and account pages are all handled by the single map page.
  async rewrites() {
    return [
      { source: "/p/:id", destination: "/" },
      { source: "/settings", destination: "/" },
      { source: "/account", destination: "/" },
    ];
  },
};

export default nextConfig;
