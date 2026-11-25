import { expect, test, type Page } from '@playwright/test';

// 아고라 원작 상세(가짜 응답의 Lind 작품) → Go to derive → 파생 워크스페이스의 답변 2열
const ORIGINAL = '6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';

async function derive(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto(`/agora/projects/${ORIGINAL}`);
  await page.getByRole('button', { name: 'Go to derive' }).click();
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
}

const originCard = (page: Page) => page.locator('article[data-readonly="true"]');
const mineCard = (page: Page) => page.locator('[data-id$=":answer"] article');

/** k1 노드를 펼쳐 가중치를 바꾸고, 미리보기가 다 만들어지면 Apply the fix 로 확정한다. */
async function editAndApply(page: Page, key: 'Home' | 'End') {
  const node = page.locator('[data-id$=":k1"]');
  // 파생 첫 화면은 5단계 쪽을 보여 주므로 1단계 노드는 화면 밖이다. 키보드로 연다.
  await node.getByRole('button', { name: 'Edit node' }).focus();
  await page.keyboard.press('Enter');
  await expect(node.locator('.node-open')).toBeVisible();
  const dial = page.getByRole('slider', { name: 'Weighting', exact: true });
  await dial.focus();
  await page.keyboard.press(key);
  const apply = page.getByRole('button', { name: 'Apply the fix', exact: true });
  await expect(apply).toBeEnabled({ timeout: 15000 });
  await apply.click();
  await expect(page.locator('.node-open')).toHaveCount(0);
}

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`right after deriving, the original answer is active and My answer is not there yet at ${size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    await derive(page);
    const origin = page.getByText(/’s answer$/);
    await expect(origin).toBeVisible();
    // 아무것도 고치지 않았으면 원작 답변은 흐리지 않고, 내 답변 노드는 아직 없다(#229)
    await expect(page.getByText('My answer', { exact: true })).toHaveCount(0);
    await expect(mineCard(page)).toHaveCount(0);
    await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
    await expect(originCard(page).locator('.canvas-origin-veil')).toHaveCount(0);
    // 원작 카드는 읽기 전용이라 버튼(핀·버전 이동)이 없다.
    await expect(originCard(page).locator('button')).toHaveCount(0);
    await expect(originCard(page).locator('.canvas-answer-chip')).toBeVisible();
    await page.screenshot({ path: info.outputPath('01-derive-fresh.png') });
  });
}

test('an edit makes My answer active, clicking either answer switches which one is active (#229)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await derive(page);
  await editAndApply(page, 'Home');
  const mine = page.getByText('My answer', { exact: true });
  await expect(mine).toBeVisible();
  const [above, below] = await Promise.all([
    page.getByText(/’s answer$/).boundingBox(),
    mine.boundingBox(),
  ]);
  expect(above!.y).toBeLessThan(below!.y);
  // 내 답변이 활성, 원작 답변은 흐림
  await expect(mineCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(originCard(page)).toHaveAttribute('data-inactive', 'true');
  await expect(originCard(page).locator('.canvas-origin-veil')).toHaveCount(1);
  // 내 답변의 버전 넘기기에는 원작 복사본이 들어 있지 않다(첫 내 버전이라 앞으로 갈 수 없다)
  await expect(page.getByRole('button', { name: 'Previous version' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('02-derive-mine-active.png') });

  // 원작 답변을 누르면 원작이 다시 활성, 내 답변은 비활성(편집 뒤 화면이 1단계 쪽에 있어 카드로 먼저 옮긴다)
  await originCard(page).getByRole('button').focus();
  await originCard(page).getByRole('button').click();
  await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(mineCard(page)).toHaveAttribute('data-inactive', 'true');
  await expect(mine).toBeVisible();
  // 노드도 원작(복사본) 값으로 돌아간다
  await expect(page.locator('[data-id$=":k1"] article')).toBeVisible();
  await page.screenshot({ path: info.outputPath('03-derive-origin-active.png') });

  // 내 답변을 누르면 그 반대
  await mineCard(page)
    .getByRole('button', { name: /^Answer/ })
    .click();
  await expect(mineCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(originCard(page)).toHaveAttribute('data-inactive', 'true');
  await expect(page.getByRole('button', { name: 'Previous version' })).toBeVisible();
});

test('My answer label stays visible above stacked versions (#229)', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await derive(page);
  await editAndApply(page, 'Home');
  await editAndApply(page, 'End');
  await editAndApply(page, 'Home');
  const layers = page.locator('[data-id$=":answer"] .canvas-answer-layer');
  await expect(layers).toHaveCount(2);
  const label = page.getByText('My answer', { exact: true });
  await expect(label).toBeVisible();
  // 편집 뒤 화면이 1단계 쪽에 있으므로 내 답변 카드로 옮긴다
  await page.getByRole('button', { name: 'Previous version' }).focus();
  await page.waitForTimeout(400);
  const box = (await label.boundingBox())!;
  // 머리글 가운데를 누르면 머리글 자신이 잡힌다(뒤 장에 가리지 않는다)
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.textContent ?? '',
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe('My answer');
  for (const layer of await layers.all()) {
    const rect = (await layer.boundingBox())!;
    expect(rect.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
  }
  await page.screenshot({ path: info.outputPath('04-derive-stacked-label.png') });
});
