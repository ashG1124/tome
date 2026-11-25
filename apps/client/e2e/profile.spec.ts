import { expect, test, type Page } from '@playwright/test';

// 가짜 응답 모드의 나(Visitor 1)와 다른 창작자(Lind). src/shared/api/fake 의 값과 같다.
const ME = '5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b10';
const LIND = '3e7a1c9d-4b2f-4d8e-a6c5-1f0b2d3e4a5c';

async function openProfile(page: Page, id = ME) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto(`/creators/${id}`);
  await expect(page.getByRole('tablist')).toBeVisible();
}

/** 가로 스크롤이 없고, 보이는 요소가 화면 오른쪽 밖으로 나가지 않는다. */
async function expectNoHorizontalClipping(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe('프로필 Proto v7 배치(1728×1083, 메뉴바 34 를 뺀 Figma 좌표)', () => {
  test.use({ viewport: { width: 1728, height: 1083 } });

  test('머리글·탭·오른쪽 패널이 Figma 자리에 놓인다', async ({ page }) => {
    await openProfile(page);
    const tab = page.getByRole('tab', { name: 'Work' });
    // Identity Segment 4181:35713: y 260 − 34, 높이 46
    expect(await tab.boundingBox()).toMatchObject({ y: 226, height: 46 });
    // 오른쪽 패널 4181:35168: x 1323, y 134 − 34, 폭 384, 아래 여백 33
    const panel = page.getByRole('complementary', { name: 'About your identity' });
    expect(await panel.boundingBox()).toMatchObject({ x: 1323, y: 100, width: 384, height: 950 });
    // 첫 작품 카드(4181:35070): x 41, y 367 − 34, 108×192
    const card = page.getByRole('tabpanel').getByRole('link').first();
    expect(await card.boundingBox()).toMatchObject({ x: 41, y: 333, width: 108, height: 192 });
  });

  test('Identity 탭: 좌표 판·좌표 두 장·Other Creators 가 Figma 자리에 놓인다', async ({
    page,
  }) => {
    await openProfile(page);
    await page.getByRole('tab', { name: 'Identity' }).click();
    const ai = page.locator('[data-chart="ai"]');
    const decision = page.locator('[data-chart="decision"]');
    // Chart Area 4181:35176: (26 + 36.19, 387 − 34 + 36.19 + 46), 578.84 각
    const aiBox = (await ai.boundingBox())!;
    expect(Math.round(aiBox.x)).toBe(62);
    expect(Math.round(aiBox.y)).toBe(435);
    expect(Math.round(aiBox.width)).toBe(579);
    const decisionBox = (await decision.boundingBox())!;
    expect(Math.round(decisionBox.x)).toBe(676);
    const panel = page.getByRole('complementary', { name: 'Other Creators' });
    expect(await panel.boundingBox()).toMatchObject({ x: 1323, y: 100, width: 384 });
    await expect(panel.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    await expect(panel.getByRole('slider', { name: 'Similarity to you' })).toBeVisible();
  });
});

test.describe('탭·비교 동작', () => {
  test.use({ viewport: { width: 1728, height: 1083 } });

  test('탭은 ←/→ 로 옮기고, Compare 탭은 없다(Proto v7)', async ({ page }) => {
    await openProfile(page);
    await expect(page.getByRole('tab')).toHaveText(['Work', 'Identity']);
    await page.getByRole('tab', { name: 'Work' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Identity' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('complementary', { name: 'Other Creators' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('complementary', { name: 'About your identity' })).toBeVisible();
  });

  test('사분면을 고르면 걸린 사람만 사진·선으로 보이고, 줄을 가리키면 좌표에서 밝힌다', async ({
    page,
  }) => {
    await openProfile(page);
    await page.getByRole('tab', { name: 'Identity' }).click();
    const panel = page.getByRole('complementary', { name: 'Other Creators' });
    const ai = page.locator('[data-chart="ai"]');
    await expect(ai.locator('[data-state="dot"]')).toHaveCount(2);
    await expect(ai.locator('line')).toHaveCount(0);

    // Lind(ai 위·오른쪽)만 걸린다
    await panel.getByRole('button', { name: 'Light touch, Creator leads' }).click();
    await expect(panel.getByRole('status')).toHaveText('1 matches');
    await expect(ai.locator(`[data-person="${LIND}"]`)).toHaveAttribute('data-state', 'shown');
    await expect(ai.locator('line')).toHaveCount(1);

    await panel.locator('li[data-creator]').first().hover();
    await expect(ai.locator(`[data-person="${LIND}"]`)).toHaveAttribute(
      'data-state',
      'highlighted',
    );
    // 리믹스 화살표는 줄을 가리킬 때 보인다
    await expect(panel.getByRole('button', { name: 'Remix with Lind' })).toHaveCSS('opacity', '1');

    await panel.getByRole('button', { name: 'clear' }).click();
    await expect(panel.getByRole('status')).toHaveText('2 matches');
  });

  test('검색·Similarity 막대(키보드)로 거르고, 화살표로 리믹스 워크스페이스에 들어간다', async ({
    page,
  }) => {
    await openProfile(page);
    await page.getByRole('tab', { name: 'Identity' }).click();
    const panel = page.getByRole('complementary', { name: 'Other Creators' });
    await panel.getByRole('searchbox').fill('mar');
    await expect(panel.getByRole('status')).toHaveText('1 matches');
    await panel.getByRole('searchbox').fill('');

    const slider = panel.getByRole('slider', { name: 'Similarity to you' });
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuetext', '0~90');
    await expect(panel.getByText('0~90')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(panel.getByRole('status')).toHaveText('0 matches');
    await page.keyboard.press('End');
    await expect(panel.getByRole('status')).toHaveText('2 matches');

    // 키보드로 줄에 들어오면 화살표가 보이고 Enter 로 누른다
    const remix = panel.getByRole('button', { name: 'Remix with Lind' });
    await remix.focus();
    await expect(remix).toHaveCSS('opacity', '1');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('패널 구역 접기·닫기(X)', async ({ page }) => {
    await openProfile(page);
    const panel = page.getByRole('complementary', { name: 'About your identity' });
    await panel.getByRole('button', { name: 'Identity Type' }).click();
    await expect(panel.getByText('session')).toBeHidden();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('complementary')).toHaveCount(0);
  });

  test('남의 프로필: 이름표가 그 사람 이름, 작품은 아고라 상세로 간다', async ({ page }) => {
    await openProfile(page, LIND);
    await expect(page.getByRole('heading', { level: 1, name: 'Lind' })).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: "About this creator's identity" }),
    ).toBeVisible();
    await expect(page.getByRole('tabpanel').getByRole('link').first()).toHaveAttribute(
      'href',
      /\/agora\/projects\//,
    );
    await page.getByRole('tab', { name: 'Identity' }).click();
    await expect(page.locator('[data-chart="ai"] [data-focal]')).toContainText('Lind');
    await expect(page.getByText('Similarity to Lind')).toBeVisible();
  });
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`${size.width}×${size.height} 에서 두 탭 모두 잘림이 없다`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await openProfile(page);
    await expectNoHorizontalClipping(page);
    const panel = page.getByRole('complementary', { name: 'About your identity' });
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(size.width);
    await page.screenshot({ path: info.outputPath(`work-${size.width}.png`) });

    await page.getByRole('tab', { name: 'Identity' }).click();
    await expectNoHorizontalClipping(page);
    const ai = (await page.locator('[data-chart="ai"]').boundingBox())!;
    const decision = (await page.locator('[data-chart="decision"]').boundingBox())!;
    const other = (await page
      .getByRole('complementary', { name: 'Other Creators' })
      .boundingBox())!;
    // 좌표 두 장은 정사각형이고 서로·패널과 겹치지 않는다
    expect(Math.round(ai.width)).toBe(Math.round(ai.height));
    expect(ai.x + ai.width).toBeLessThanOrEqual(decision.x);
    expect(decision.x + decision.width).toBeLessThanOrEqual(other.x);
    // 창작자 목록은 패널 안에서 보인다
    await expect(page.locator('li[data-creator]').first()).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`identity-${size.width}.png`), fullPage: true });
  });
}
