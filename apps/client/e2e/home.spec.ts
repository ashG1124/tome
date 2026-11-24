import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1728, height: 1083 } });

async function enterShelf(page: import('@playwright/test').Page) {
  await page.goto('/enter');
  await page.getByRole('textbox').fill('any-code');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('button', { name: 'Agree and start' }).click();
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
}

test('서가 칸이 Figma 좌표(x 41 + 128n, y 132)에 놓인다', async ({ page }) => {
  await enterShelf(page);
  const cells = page.locator('ol > li');
  const box = async (n: number) => (await cells.nth(n).boundingBox())!;
  expect(await box(0)).toMatchObject({ x: 41, y: 132, width: 108, height: 192 });
  expect(await box(1)).toMatchObject({ x: 169, y: 132, width: 108, height: 192 });
  expect(await box(2)).toMatchObject({ x: 297, y: 132, width: 108, height: 192 });
});

test('hover 하면 카드가 364px 로 넓어지고 같은 줄 뒤 카드가 256px 밀린다', async ({ page }) => {
  await enterShelf(page);
  const cells = page.locator('ol > li');
  await cells.nth(1).hover();
  const card = cells.nth(1).locator('[data-cover] > div');
  await expect.poll(async () => (await card.boundingBox())?.width).toBe(364);
  await expect.poll(async () => (await cells.nth(2).boundingBox())?.x).toBe(297 + 256);
});

test('키보드 포커스도 hover 와 같게 넓어지고 포커스 테두리가 보인다', async ({ page }) => {
  await enterShelf(page);
  await page.getByRole('link', { name: 'Neon street at night' }).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const card = page.locator('ol > li').nth(1).locator('[data-cover] > div');
  await expect.poll(async () => (await card.boundingBox())?.width).toBe(364);
  await expect(card).toHaveCSS('outline-style', 'solid');
});
