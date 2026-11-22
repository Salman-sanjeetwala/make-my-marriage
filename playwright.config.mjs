import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run build --workspace @mmm/api && npm run start --workspace @mmm/api',
      url: 'http://127.0.0.1:8777/api/health',
      env: { PORT: '8777', NODE_ENV: 'test' },
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'npm run dev --workspace @mmm/web -- --proxy-config ../../e2e/proxy.conf.json',
      url: 'http://localhost:4200',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
