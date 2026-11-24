import { expect, test, type Page } from '@playwright/test';
import type { JobStage } from '@tome/shared';
const PROJECT = '/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c';
interface AdvanceCall {
  stage: JobStage;
  at: number;
}

// Intercept only this page's API module; successful calls still use the real fake API.
async function configureAdvance(
  page: Page,
  options: {
    failOnce?: { stage: JobStage; code: 'AI_TIMEOUT' | 'AI_UNAVAILABLE' | 'STEP_IN_PROGRESS' };
    holdImage?: boolean;
  },
) {
  await page.route(/\/src\/shared\/api\/endpoints\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: `${body}
const canvasTestOptions = ${JSON.stringify(options)};
const canvasOriginalAdvance = api.advanceJob;
let canvasFailureUsed = false;
window.__canvasAdvanceCalls = [];
window.__canvasImageHeld = false;
api.advanceJob = async (jobId, stage) => {
  window.__canvasAdvanceCalls.push({ stage, at: performance.now() });
  if (!canvasFailureUsed && canvasTestOptions.failOnce?.stage === stage) {
    canvasFailureUsed = true;
    const { ApiRequestError } = await import('/src/shared/api/index.ts');
    const code = canvasTestOptions.failOnce.code;
    throw new ApiRequestError(code === 'STEP_IN_PROGRESS' ? 409 : code === 'AI_TIMEOUT' ? 504 : 503, {
      code, message: code, retryable: true,
      ...(code === 'STEP_IN_PROGRESS' ? { details: { retryAfterMs: 1000 } } : {}),
    });
  }
  if (canvasTestOptions.holdImage && stage === 'image') {
    await new Promise((resolve) => {
      window.addEventListener('canvas-test-release-image', resolve, { once: true });
      window.__canvasImageHeld = true;
    });
  }
  return canvasOriginalAdvance(jobId, stage);
};
`,
    });
  });
}

async function advanceCalls(page: Page): Promise<AdvanceCall[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __canvasAdvanceCalls?: AdvanceCall[] }).__canvasAdvanceCalls ?? [],
  );
}

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
  await expect(
    page.getByRole('region', { name: 'Generation canvas' }).getByRole('status'),
  ).toHaveText('Step 5 of 5 done');
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
    await expect(
      page.getByRole('region', { name: 'Generation canvas' }).getByRole('status'),
    ).toHaveText('Step 5 of 5 done');
    await expect(page.locator('[data-canvas-card$=":v1"]')).toHaveCount(count);
  }
  await expect(page.locator('.workspace-canvas')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-canvas-card$=":prompt"]')).toHaveCount(3);
  await expect(page.locator('[data-canvas-card][tabindex="0"]')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge[tabindex="0"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('retries one failed step while earlier results remain', async ({ page }, info) => {
  await configureAdvance(page, { failOnce: { stage: 'draft', code: 'AI_UNAVAILABLE' } });
  await openWorkspace(page);
  await generate(page);
  await expect(page.getByRole('alert')).toContainText('Something went wrong.');
  await expect(page.locator('[data-canvas-card$=":e1"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('retry-before.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.canvas-image')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Generation canvas' }).getByRole('status'),
  ).toHaveText('Step 5 of 5 done');
  await expect(page.locator('[data-canvas-card$=":e1"]')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const calls = await advanceCalls(page);
  expect(calls.filter((call) => call.stage === 'draft')).toHaveLength(2);
  expect(calls.filter((call) => call.stage === 'evidence')).toHaveLength(1);
});

test('retries a timed-out step once on its own without an error (#222)', async ({ page }) => {
  await configureAdvance(page, { failOnce: { stage: 'draft', code: 'AI_TIMEOUT' } });
  await openWorkspace(page);
  await generate(page);
  await expect(page.locator('.canvas-image')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Generation canvas' }).getByRole('status'),
  ).toHaveText('Step 5 of 5 done');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const calls = await advanceCalls(page);
  expect(calls.filter((call) => call.stage === 'draft')).toHaveLength(2);
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
  await configureAdvance(page, { failOnce: { stage: 'research', code: 'STEP_IN_PROGRESS' } });
  await openWorkspace(page);
  await generate(page);
  await expect(page.locator('.canvas-image')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  const research = (await advanceCalls(page)).filter((call) => call.stage === 'research');
  expect(research).toHaveLength(2);
  expect(research[1]!.at - research[0]!.at).toBeGreaterThanOrEqual(900);
});

test('reduced motion stops the gradient and layout fits 1536px', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await configureAdvance(page, { holdImage: true });
  await openWorkspace(page);
  await generate(page);
  await page.waitForFunction(
    () => (window as unknown as { __canvasImageHeld?: boolean }).__canvasImageHeld === true,
  );
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
  await page.evaluate(() => window.dispatchEvent(new Event('canvas-test-release-image')));
  await expect(page.locator('.canvas-image')).toBeVisible();
  await expect(page.locator('.canvas-gradient')).toHaveCount(0);
});
