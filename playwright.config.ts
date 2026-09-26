import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
    // Local classroom API (in-memory rooms), same router and room server as the Worker.
    { command: 'npm run api', url: 'http://127.0.0.1:8787/health', reuseExistingServer: true },
  ],
  reporter: 'list',
  timeout: 30000,
});
