import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "5176";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["web.spec.ts", "scenario.spec.ts", "revisit.spec.ts", "speech.spec.ts"],
  fullyParallel: true,
  use: {
    baseURL,
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run web -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
