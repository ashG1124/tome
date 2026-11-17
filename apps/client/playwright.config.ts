import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

// 가짜 응답 모드(기본값)로 dev 서버만 띄우므로 백엔드 없이 돈다.
export default defineConfig({
  outputDir: './test-results/e2e',
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { VITE_API_MODE: 'fake', VITE_FAKE_DELAY_MS: '300' },
  },
});
