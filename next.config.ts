import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["google-auth-library"],
  // mock mode (local + Vercel Previews) runs the real engine: ship Code.gs and the fixture with the server bundle
  outputFileTracingIncludes: { "/**": ["./apps-script/Code.gs", "./apps-script/test/wb.json"] },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
