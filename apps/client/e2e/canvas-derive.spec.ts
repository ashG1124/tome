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

/** 이번 페이지의 첫 생성 단계 하나를 한 번만 실패시킨다(AI_UNAVAILABLE, 다시 시도 가능). 나머지는 가짜 응답 그대로다. */
async function failFirstAdvance(page: Page) {
  await page.route(/\/src\/shared\/api\/endpoints\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: `${body}
const deriveOriginalAdvance = api.advanceJob;
let deriveFailureUsed = false;
api.advanceJob = async (jobId, stage) => {
  if (!deriveFailureUsed) {
    deriveFailureUsed = true;
    const { ApiRequestError } = await import('/src/shared/api/index.ts');
    throw new ApiRequestError(503, { code: 'AI_UNAVAILABLE', message: 'AI_UNAVAILABLE', retryable: true });
  }
  return deriveOriginalAdvance(jobId, stage);
};
`,
    });
  });
}

const originCard = (page: Page) => page.locator('article[data-readonly="true"]');
const mineCard = (page: Page) => page.locator('[data-id$=":answer"] article');

/** k1 노드를 펼친다. 파생 첫 화면은 5단계 쪽을 보여 주므로 1단계 노드는 화면 밖이다. 키보드로 연다. */
async function openK1(page: Page) {
  const node = page.locator('[data-id$=":k1"]');
  await node.getByRole('button', { name: 'Edit node' }).focus();
  await page.keyboard.press('Enter');
  await expect(node.locator('.node-open')).toBeVisible();
  return page.getByRole('slider', { name: 'Weighting', exact: true });
}

/** k1 노드를 펼쳐 가중치를 바꾸고, 미리보기가 다 만들어지면 Apply the fix 로 확정한다. */
async function editAndApply(page: Page, key: 'Home' | 'End') {
  const dial = await openK1(page);
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
  // 내 첫 버전은 원작 복사본을 빼고 Answer 01 부터 센다(#235)
  await expect(mineCard(page).locator('.canvas-answer-chip')).toHaveText('Answer 01');
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
  // 흐린 카드를 누르면 활성만 바뀌고 크게 보기는 열리지 않는다. 활성인 내 답변을 누르면 크게 보기가 열린다(#230).
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await mineCard(page).locator('.canvas-image-slot').click();
  const view = page.getByRole('dialog');
  await expect(view.getByRole('button', { name: 'Download' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('05-derive-mine-image-view.png') });
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  // 흐린 원작 답변 카드의 첫 누름은 활성만 바꾸고 크게 보기는 열지 않는다(#237).
  await originCard(page).getByRole('button').focus();
  await originCard(page).getByRole('button').click();
  await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // 활성인 원작 답변 카드를 누르면 카드에 보이는 원작 그림을 원작 제목으로 크게 보기·Download 로 연다(#237).
  const originSrc = await originCard(page).locator('img.canvas-image').getAttribute('src');
  await originCard(page).click();
  await expect(view.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(view.locator('img')).toHaveAttribute('src', originSrc!);
  const title = (await view.locator('img').getAttribute('alt')) ?? '';
  expect(title).not.toBe('');
  await expect(view).toHaveAccessibleName(title);
  await page.screenshot({ path: info.outputPath('06-derive-origin-image-view.png') });
  // 닫으면 포커스가 원작 카드로 돌아오고, Enter 로도 연다.
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(originCard(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view.getByRole('button', { name: 'Download' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
});

test('closing the editor without any change leaves no My answer (#237)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await derive(page);
  const dial = await openK1(page);
  await dial.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.node-open')).toHaveCount(0);
  await expect(page.getByText('My answer', { exact: true })).toHaveCount(0);
  await expect(mineCard(page)).toHaveCount(0);
  await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
});

test('a preview shows only in Preview; the answer cards do not change until Apply (#261)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await derive(page);
  const originSrc = await originCard(page).locator('img.canvas-image').getAttribute('src');
  const dial = await openK1(page);
  await dial.focus();
  await page.keyboard.press('Home');
  const panel = page.locator('.node-preview-panel');
  const apply = page.getByRole('button', { name: 'Apply the fix', exact: true });
  // 값을 고친 직후에도, 미리보기를 다 만든 뒤에도 캔버스의 답변은 그대로다: My answer 가 없고 원작 답변이 활성이다.
  await expect(dial).toHaveValue('0');
  await expect(page.getByText('My answer', { exact: true })).toHaveCount(0);
  await expect(mineCard(page)).toHaveCount(0);
  await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(apply).toBeEnabled({ timeout: 15000 });
  await expect(panel.locator('.node-preview-image img')).toBeVisible();
  await expect(page.getByText('My answer', { exact: true })).toHaveCount(0);
  await expect(mineCard(page)).toHaveCount(0);
  await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(originCard(page).locator('img.canvas-image')).toHaveAttribute('src', originSrc!);
  await page.screenshot({ path: info.outputPath('07-derive-preview-only-in-panel.png') });
  // Apply 해야 My answer 가 생기고 활성이 된다.
  await apply.click();
  await expect(page.getByText('My answer', { exact: true })).toBeVisible();
  await expect(mineCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(originCard(page)).toHaveAttribute('data-inactive', 'true');
});

test('a failed preview shows the error and Retry in Preview, not on the answer cards (#261)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await failFirstAdvance(page);
  await derive(page);
  const dial = await openK1(page);
  await dial.focus();
  await page.keyboard.press('Home');
  const panel = page.locator('.node-preview-panel');
  const alert = panel.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15000 });
  // 캔버스에는 My answer 도, 카드 위 오류도 없다. 원작 답변이 그대로 활성이다.
  await expect(page.getByText('My answer', { exact: true })).toHaveCount(0);
  await expect(mineCard(page)).toHaveCount(0);
  await expect(originCard(page)).not.toHaveAttribute('data-inactive', 'true');
  await expect(originCard(page).getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('08-derive-preview-failed-in-panel.png') });
  // Preview 의 Retry 로 다시 만들면 Preview 에 그림이 보이고 Apply 할 수 있다.
  await alert.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply the fix', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.locator('.node-preview-image img')).toBeVisible();
  await expect(mineCard(page)).toHaveCount(0);
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
