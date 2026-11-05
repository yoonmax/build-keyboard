import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5201',
    viewport: { width: 1440, height: 900 },
    channel: 'chromium',
    launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
    acceptDownloads: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 5201 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5201',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
