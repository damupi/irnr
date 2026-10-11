import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/tax/**"],
      exclude: ["src/lib/tax/**/*.test.ts", "src/lib/tax/__fixtures__/**", "src/lib/tax/types.ts"],
      thresholds: { branches: 100 },
    },
  },
});
