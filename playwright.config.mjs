import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.ECHO_RIFT_TEST_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  timeout: 45_000,
  expect: { timeout: 7_500 },
  outputDir: 'test-results',
  use: {
    baseURL,
    headless: true,
    locale: 'fr-FR',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    actionTimeout: 7_500,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
  },
  projects: [
    {
      name: 'desktop-chromium',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    },
    {
      name: 'mobile-chromium',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'] }
    }
  ],
  webServer: {
    command: 'node local-server.js',
    env: { ECHO_RIFT_NO_OPEN: '1', PORT: String(port) },
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
