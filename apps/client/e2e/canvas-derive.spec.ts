import { expect, test } from '@playwright/test';

// 아고라 원작 상세(가짜 응답의 Lind 작품) → Go to derive → 파생 워크스페이스의 답변 2열
const ORIGINAL = '6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`derive shows the original answer above My answer at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      localStorage.setItem('tome.token', 'fake-token');
      localStorage.setItem('tome.fake.consented', '1');
    });
    await page.goto(`/agora/projects/${ORIGINAL}`);
    await page.getByRole('button', { name: 'Go to derive' }).click();
    await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();

    const origin = page.getByText(/’s answer$/);
    const mine = page.getByText('My answer', { exact: true });
    await expect(origin).toBeVisible();
    await expect(mine).toBeVisible();
    const [above, below] = await Promise.all([origin.boundingBox(), mine.boundingBox()]);
    expect(above!.y).toBeLessThan(below!.y);
    // 원작 카드는 읽기 전용이라 버튼(핀·버전 이동)이 없다.
    await expect(page.locator('[data-readonly="true"] button')).toHaveCount(0);
    await expect(page.locator('[data-readonly="true"] .canvas-answer-chip')).toBeVisible();
  });
}
