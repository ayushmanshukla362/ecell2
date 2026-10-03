import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.10' } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.11' } } },
  ],
  webServer: { command: 'node backend/tests/browser-server.mjs', url: 'http://127.0.0.1:4174/api/health', reuseExistingServer: false },
})
