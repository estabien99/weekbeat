import { defineConfig } from '@playwright/test';

// Screenshots at phone and tablet width (CLAUDE.md: check every UI change at both).
// PW_CHROMIUM lets a pre-installed browser be used (cloud sessions: /opt/pw-browsers/chromium).
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
