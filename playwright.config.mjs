import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

const PORT = 3300;
// Set E2E_BASE_URL to test a deployed site instead of a local build.
const remote = process.env.E2E_BASE_URL;

// Runs against a production build. Smoke tests need nothing else; the
// community tests also need the Supabase keys in .env.local.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: remote || `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    geolocation: { latitude: 37.3192, longitude: -122.0454 },
    permissions: ["geolocation"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /community/ },
  ],
  webServer: remote
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
      },
});
