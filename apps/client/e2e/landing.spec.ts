import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`랜딩은 ${viewport.width}×${viewport.height} 에서 가로 스크롤이 없다`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.inner);

    // 끝까지 내려가도 가로 스크롤이 생기지 않는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const after = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(after).toBeLessThanOrEqual(widths.inner);
    await context.close();
  });
}

test('Get Started 를 누르면 전시 코드 화면으로 간다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started' }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByRole('heading', { name: 'Enter the exhibition code' })).toBeVisible();
});

test('Tab 키로 로고 → 메뉴 → Get Started 에 닿고 포커스 테두리가 보인다', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Get Started' });
  const names: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    names.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          '',
      ),
    );
    if (await cta.evaluate((el) => el === document.activeElement)) break;
  }
  expect(names).toEqual(['TÓME', 'My Work', 'Remix', 'Derive', 'Identity', 'Get Started']);
  await expect(cta).toBeFocused();
  await expect(cta).toHaveCSS('outline-style', 'solid');
});

test('맨 위로 버튼을 누르면 맨 위로 올라가고 포커스가 로고 링크로 간다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Back to top' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('link', { name: 'TÓME' })).toBeFocused();
});

test.describe('움직임 줄이기', () => {
  test.use({ reducedMotion: 'reduce' });

  test('연출 없이 정지 상태로 그려진다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
    // 히어로 이미지·로고가 처음부터 보이는 상태이고 transform 이 걸려 있지 않다
    const states = await page.evaluate(() => {
      const tile = document.querySelector('[data-hero-tile]') as HTMLElement;
      const enter = document.querySelector('[data-hero-enter]') as HTMLElement;
      const logo = document.querySelector('[data-hero-logo-in]') as HTMLElement;
      return [tile, enter, logo].map((el) => {
        const style = getComputedStyle(el);
        return { opacity: style.opacity, transform: style.transform };
      });
    });
    expect(states[0]).toEqual({ opacity: '1', transform: 'none' });
    expect(states[1]).toEqual({ opacity: '1', transform: 'none' });
    expect(states[2]).toEqual({ opacity: '1', transform: 'none' });

    // 스크롤해도 이미지가 움직이지 않는다
    const before = await page.locator('[data-hero-tile]').first().boundingBox();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    const after = await page.locator('[data-hero-tile]').first().boundingBox();
    expect(Math.round((before?.y ?? 0) - (after?.y ?? 0))).toBe(
      await page.evaluate(() => Math.round(window.scrollY)),
    );
  });
});
