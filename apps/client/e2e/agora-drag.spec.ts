import { expect, test } from '@playwright/test';

// 아고라 홈의 가로 줄을 마우스로 잡아끌어 옮긴다(#263). 가짜 응답 모드의 고정 데이터를 쓴다.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  // 추천 카드가 줄 밖으로 넘치도록 좁은 화면에서 본다
  await page.setViewportSize({ width: 900, height: 900 });
});

test('가로 줄을 잡아끌면 옮겨지고, 끈 뒤에는 카드가 열리지 않는다', async ({ page }, info) => {
  await page.goto('/agora');
  const row = page.getByRole('region', { name: 'Recommended Project' }).getByRole('list');
  await expect(row.getByRole('link').first()).toBeVisible();
  expect(await row.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100);

  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  const startX = box.x + box.width - 60;

  // 왼쪽으로 잡아끌면 뒤쪽 카드가 따라 들어온다
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 200, y, { steps: 6 });
  await expect(row).toHaveAttribute('data-dragging', '');
  await page.screenshot({ path: info.outputPath('01-agora-row-dragging.png') });
  await page.mouse.up();
  await expect(row).not.toHaveAttribute('data-dragging');
  expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(150);
  // 끈 뒤에 따라오는 클릭으로 카드가 열리지 않는다
  await expect(page).toHaveURL(/\/agora$/);

  // 오른쪽으로 끌면 되돌아간다
  await page.mouse.move(startX - 200, y);
  await page.mouse.down();
  await page.mouse.move(startX + 200, y, { steps: 6 });
  await page.mouse.up();
  expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(page).toHaveURL(/\/agora$/);
});

test('끌지 않고 누르면 평소처럼 카드가 열린다', async ({ page }) => {
  await page.goto('/agora');
  const row = page.getByRole('region', { name: 'Recommended Project' }).getByRole('list');
  await row.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/agora\/projects\//);
});
