import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  use: {
    baseURL: `${origin}/`,
    timezoneId: "UTC",
    locale: "en-US",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
