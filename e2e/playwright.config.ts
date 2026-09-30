import { defineConfig, devices } from "@playwright/test";

// Every test runs against a fake backend (see fakeBackend.ts) — requests to
// the Express API on :5001 are intercepted in the browser, so no database,
// email provider or seeded account is needed. The three real frontends are
// started (or, locally, reused if already running) on their fixed ports.
const apps = [
  { name: "owner", port: 3003 },
  { name: "patient", port: 3001 },
  { name: "hospital", port: 3002 },
];

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  projects: apps.map((app) => ({
    name: app.name,
    testDir: `./tests/${app.name}`,
    use: { baseURL: `http://localhost:${app.port}` },
  })),
  webServer: apps.map((app) => ({
    command: "npm run dev",
    cwd: `../${app.name}-frontend`,
    port: app.port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  })),
});
