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

/** 서가 카드 제목(링크) 순서 */
async function shelfTitles(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('ol > li[data-project-id] a').allTextContents();
}

test('아무 작업도 하지 않은 새 프로젝트는 서가에 썸네일 카드가 생기지 않는다 (#227)', async ({
  page,
}) => {
  await enterShelf(page);
  expect(await shelfTitles(page)).toEqual(['Neon street at night', 'Desk lamp study']);

  await page.getByRole('button', { name: 'Project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await page.goBack();

  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
  expect(await shelfTitles(page)).toEqual(['Neon street at night', 'Desk lamp study']);
  await expect(page.getByRole('link', { name: 'Untitled' })).toHaveCount(0);
});

test('썸네일 상자 어디를 눌러도(제목이 아닌 곳도) 프로젝트로 들어간다 (#227)', async ({ page }) => {
  await enterShelf(page);
  const card = page.locator('ol > li').nth(1);
  const box = (await card.boundingBox())!;
  // 좁은 카드의 오른쪽 위(태그 근처)와 가운데 — 제목 글자가 없는 자리
  await page.mouse.click(box.x + box.width - 8, box.y + 8);
  await expect(page).toHaveURL(/\/projects\/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c$/);

  await page.goBack();
  const again = (await page.locator('ol > li').nth(1).boundingBox())!;
  await page.mouse.click(again.x + again.width / 2, again.y + again.height / 2);
  await expect(page).toHaveURL(/\/projects\/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c$/);
});

test('썸네일을 마우스로 잡아 다른 칸에 놓으면 순서가 바뀌고, 끄는 동안 포인터를 따라간다 (#227)', async ({
  page,
}) => {
  await enterShelf(page);
  const neon = page.locator('li[data-project-id="0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c"]');
  await page.mouse.move(169 + 54, 132 + 96);
  await page.mouse.down();
  await page.mouse.move(169 + 54 + 64, 132 + 96 + 10, { steps: 6 });
  // 끄는 중: 카드가 포인터만큼 옮겨 그려지고 넓어지지 않는다
  await expect(neon.locator('[data-lifted]')).toHaveCount(1);
  await expect.poll(async () => (await neon.boundingBox())?.x).toBe(169 + 64);
  await page.mouse.move(297 + 54, 132 + 96, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => shelfTitles(page)).toEqual(['Desk lamp study', 'Neon street at night']);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved to position 2 of 2.' }),
  ).toHaveCount(1);
  // 내려놓은 카드는 새 칸(297)으로 들어간다
  await expect.poll(async () => (await neon.boundingBox())?.x).toBe(297);
});

test('움직임 줄이기에서도 끌어 옮기기가 되고, Escape 로 끄기를 취소한다 (#227)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterShelf(page);
  await page.mouse.move(169 + 54, 132 + 96);
  await page.mouse.down();
  await page.mouse.move(297 + 54, 132 + 96, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await shelfTitles(page)).toEqual(['Neon street at night', 'Desk lamp study']);
  await expect(page).toHaveURL(/\/$/);

  await page.mouse.move(169 + 54, 132 + 96);
  await page.mouse.down();
  await page.mouse.move(297 + 54, 132 + 96, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => shelfTitles(page)).toEqual(['Desk lamp study', 'Neon street at night']);
});

test('키보드로 Alt+→ 를 누르면 순서가 바뀌고 포커스가 그 카드에 남는다 (#227)', async ({
  page,
}) => {
  await enterShelf(page);
  const neon = page.getByRole('link', { name: 'Neon street at night' });
  await neon.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => shelfTitles(page)).toEqual(['Desk lamp study', 'Neon street at night']);
  await expect(neon).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved to position 2 of 2.' }),
  ).toHaveCount(1);
  // 넓어진 카드 번호도 옮긴 자리를 따라가서, 옮긴 카드가 자기 자리(297)에 그대로 있다(밀리지 않음)
  const item = page.locator('li[data-project-id="0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c"]');
  await expect.poll(async () => (await item.boundingBox())?.x).toBe(297);
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
