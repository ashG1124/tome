import { defineConfig, devices } from '@playwright/test';

const PORT = 5175;

// 시안 비교 전용 설정. e2e/ 와 섞이지 않게 testDir 이 다르다. 실행: pnpm design:check
// viewport 는 케이스 크기로 스펙에서 맞춘다(setViewportSize). 배율은 항상 1.
export default defineConfig({
  testDir: './design-check',
  testMatch: '*.design.spec.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, deviceScaleFactor: 1 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/design-check.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
