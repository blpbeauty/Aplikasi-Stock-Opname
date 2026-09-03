/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix workspace root warning: multiple lockfiles detected
  turbopack: {
    root: __dirname,
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
  ],
};

module.exports = nextConfig;
