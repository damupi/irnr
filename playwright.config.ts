import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npm run dev:test",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
