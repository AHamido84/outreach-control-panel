import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 20000 },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname),
    },
  },
});
