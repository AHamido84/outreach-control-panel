import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["google-auth-library"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
