import { defineConfig, devices } from '@playwright/test';

// Starts its own API (fresh SQLite file, demo tools on, no funding provider, no chain watcher)
// and web server on spare ports, so it never touches your dev database or a running `npm run dev`.
const API_PORT = 4100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000, // the first run compiles the app on demand
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'rm -f e2e.db && node scripts/prisma.mjs db push && npx tsx src/index.ts',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: 'file:./e2e.db',
        PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
        DEV_TOOLS: 'true',
        FUNDING_PROVIDER: 'none',
        WATCHER_INTERVAL_MS: '0',
        BITCOIN_NETWORK: 'signet',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
