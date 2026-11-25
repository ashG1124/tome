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

test('썸네일을 마우스로 잡아 다른 카드 칸에 놓으면 둘이 자리를 맞바꾸고, 끄는 동안 포인터를 따라간다 (#227·#240)', async ({
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
    page.getByRole('status').filter({ hasText: 'Moved to row 1, column 3.' }),
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

test('키보드로 Alt+→ 를 누르면 옆 카드와 자리를 맞바꾸고 포커스가 그 카드에 남는다 (#227·#240)', async ({
  page,
}) => {
  await enterShelf(page);
  const neon = page.getByRole('link', { name: 'Neon street at night' });
  await neon.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => shelfTitles(page)).toEqual(['Desk lamp study', 'Neon street at night']);
  await expect(neon).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved to row 1, column 3.' }),
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

// ---- 자유 배치(#240): 서가 격자 아무 칸에나 놓는다 ----

const NEON = 'li[data-project-id="0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c"]';
/** 칸 (col, row) 의 왼쪽 위(기준 화면 1728: x 41 + 128n, y 132 + 212n) */
const cellAt = (col: number, row: number) => ({ x: 41 + 128 * col, y: 132 + 212 * row });

test('썸네일을 서가의 빈 칸 아무 곳에나 놓을 수 있고, 격자 칸에 붙으며 새로고침해도 남는다 (#240)', async ({
  page,
}) => {
  await enterShelf(page);
  const neon = page.locator(NEON);
  const target = cellAt(7, 2);
  await page.mouse.move(cellAt(1, 0).x + 54, cellAt(1, 0).y + 96);
  await page.mouse.down();
  // 칸 가운데에서 조금 벗어난 자리에 놓아도 가장 가까운 칸에 붙는다
  await page.mouse.move(target.x + 54 + 30, target.y + 96 - 40, { steps: 10 });
  await expect(page.locator('[data-shelf-drop]')).toHaveCount(1);
  await page.mouse.up();

  await expect.poll(async () => await neon.boundingBox()).toMatchObject(target);
  await expect(page.locator('[data-shelf-drop]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved to row 3, column 8.' }),
  ).toHaveCount(1);
  // 다른 카드는 그대로, 읽는 순서(위→아래)로 서가 순서가 바뀐다
  expect(await page.locator('li[data-project-id]').nth(0).boundingBox()).toMatchObject(
    cellAt(2, 0),
  );
  expect(await shelfTitles(page)).toEqual(['Desk lamp study', 'Neon street at night']);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
  expect(await neon.boundingBox()).toMatchObject(target);
  expect(await shelfTitles(page)).toEqual(['Desk lamp study', 'Neon street at night']);
});

test('Alt+↓ 로 한 칸씩 아래로 옮기면 서가가 늘어나 화면을 내려 볼 수 있다 (#240)', async ({
  page,
}) => {
  await enterShelf(page);
  const link = page.getByRole('link', { name: 'Neon street at night' });
  await link.focus();
  for (let n = 0; n < 5; n += 1) await page.keyboard.press('Alt+ArrowDown');
  await expect(link).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved to row 6, column 2.' }),
  ).toHaveCount(1);
  await expect(page.locator(NEON)).toHaveAttribute('data-cell', '1,5');
  const tall = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
  expect(tall).toBe(true);
  // 위로 끝까지, 왼쪽 끝 칸으로 옮긴 뒤 + Project 칸으로는 들어가지 않는다
  for (let n = 0; n < 6; n += 1) await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator(NEON)).toHaveAttribute('data-cell', '0,1');
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator(NEON)).toHaveAttribute('data-cell', '0,1');
  await expect(link).toBeFocused();
});

test('화면 폭이 바뀌어 칸 수가 줄면 넘친 카드를 줄 끝 칸으로 당기고, 다시 넓히면 원래 칸으로 돌아온다 (#240)', async ({
  page,
}) => {
  await enterShelf(page);
  const neon = page.locator(NEON);
  // 오른쪽 끝 밖으로 끌면 마지막 칸(1728 에서 13칸 → 12번)에 놓인다
  await page.mouse.move(cellAt(1, 0).x + 54, cellAt(1, 0).y + 96);
  await page.mouse.down();
  await page.mouse.move(1720, cellAt(0, 1).y + 96, { steps: 10 });
  await page.mouse.up();
  await expect(neon).toHaveAttribute('data-cell', '12,1');

  await page.setViewportSize({ width: 1536, height: 960 });
  await expect(neon).toHaveAttribute('data-cell', '10,1');
  const narrow = (await neon.boundingBox())!;
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(1536);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1536);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(neon).toHaveAttribute('data-cell', '12,1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);

  await page.setViewportSize({ width: 1728, height: 1083 });
  await expect(neon).toHaveAttribute('data-cell', '12,1');
});

test('끌어 옮긴 직후가 아니면 카드 상자를 눌러 프로젝트가 열린다 (#240 이후에도 #227 유지)', async ({
  page,
}) => {
  await enterShelf(page);
  await page.mouse.move(cellAt(1, 0).x + 54, cellAt(1, 0).y + 96);
  await page.mouse.down();
  await page.mouse.move(cellAt(4, 1).x + 54, cellAt(4, 1).y + 96, { steps: 8 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(NEON)).toHaveAttribute('data-cell', '4,1');
  const box = (await page.locator(NEON).boundingBox())!;
  await page.mouse.click(box.x + box.width - 8, box.y + 8);
  await expect(page).toHaveURL(/\/projects\/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c$/);
});
