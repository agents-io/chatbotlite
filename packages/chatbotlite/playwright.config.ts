import { defineConfig, devices } from "@playwright/test";

// E2E tests boot a local Node fixture server (tests/e2e/fixture-server.ts) that
// serves a minimal HTML page mounting the built embed bundle + a fake /api/chat
// endpoint we can swap per-test (200 SSE / 500 / etc).
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4317",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ],
  webServer: {
    command: "node --import tsx/esm tests/fixtures/server.ts",
    url: "http://127.0.0.1:4317/health",
    reuseExistingServer: !process.env.CI,
    timeout: 20_000
  }
});
