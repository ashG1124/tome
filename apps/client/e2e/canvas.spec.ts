import { expect, test, type Page } from '@playwright/test';
const PROJECT = '/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c';
async function openWorkspace(page: Page, search = '') {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto(PROJECT + search);
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
}
async function generate(page: Page) {
  await page.evaluate(async () => {
    // Exercise the same API handoff used by the workspace prompt owner.
    const modulePath = '/src/shared/api/index.ts';
    const { api, newIdempotencyKey } = await import(/* @vite-ignore */ modulePath);
    const projectId = location.pathname.split('/').at(-1)!;
    const workspace = await api.getWorkspace(projectId);
    await api.createSet(
      projectId,
      { pageId: workspace.currentPageId, prompt: 'A warm studio lamp on a wooden desk.' },
      newIdempotencyKey(),
    );
  });
  await page.reload();
}

test('progress, completion, keyboard navigation and three stacked sets', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkspace(page);
  await expect(page.locator('.canvas-controls')).toHaveCount(0);
  await generate(page);
  await expect(page.locator('[data-canvas-card$=":prompt"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('01-start.png'), fullPage: true });
  await expect(page.locator('[data-canvas-card$=":e1"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('02-middle.png'), fullPage: true });
  await expect(page.getByRole('status')).toHaveText('Step 5 of 5 done');
  await expect(page.locator('.canvas-image')).toBeVisible();
  await page.screenshot({ path: info.outputPath('03-complete.png'), fullPage: true });
  const prompt = page.locator('[data-canvas-card$=":prompt"]');
  await prompt.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-canvas-card$=":k1"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-canvas-card$=":answer"]')).toBeFocused();
  for (let count = 2; count <= 3; count++) {
    await generate(page);
    await expect(page.locator('.canvas-image')).toHaveCount(count);
    await expect(page.getByRole('status')).toHaveText('Step 5 of 5 done');
    await expect(page.locator('[data-canvas-card$=":v1"]')).toHaveCount(count);
  }
  await expect(page.locator('.workspace-canvas')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-canvas-card$=":prompt"]')).toHaveCount(3);
  await expect(page.locator('[data-canvas-card][tabindex="0"]')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge[tabindex="0"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('retries one failed step while earlier results remain', async ({ page }, info) => {
  await openWorkspace(page, '?fakeError=AI_TIMEOUT&fakeErrorStage=draft');
  await generate(page);
  await expect(page.getByRole('alert')).toContainText('Something went wrong.');
  await expect(page.locator('[data-canvas-card$=":e1"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('retry-before.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.canvas-image')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Step 5 of 5 done');
  await expect(page.locator('[data-canvas-card$=":e1"]')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('resumes persisted generation after reloading', async ({ page }) => {
  await openWorkspace(page);
  await generate(page);
  await expect(page.locator('[data-canvas-card$=":e1"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-canvas-card$=":k1"]')).toBeVisible();
  await expect(page.locator('.canvas-image')).toBeVisible();
  await expect(page.locator('[data-canvas-card$=":v1"]')).toBeVisible();
  await expect(page.locator('[data-canvas-card$=":prompt"]')).toHaveCount(1);
});

test('waits on STEP_IN_PROGRESS and completes without showing an error', async ({ page }) => {
  await openWorkspace(page, '?fakeError=STEP_IN_PROGRESS&fakeErrorStage=research');
  await generate(page);
  await expect(page.locator('.canvas-image')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('reduced motion stops the gradient and layout fits 1536px', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page);
  await generate(page);
  const gradient = page.locator('.canvas-gradient');
  await expect(gradient).toBeVisible();
  expect(await gradient.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    'none',
  );
  expect(
    await gradient.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--canvas-gradient-angle').trim(),
    ),
  ).toBe('270deg');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('1536-reduced-motion.png'), fullPage: true });
});
