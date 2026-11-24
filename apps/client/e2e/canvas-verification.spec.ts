import { expect, test, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

const SHOTS = process.env.VERIFY_SHOTS;

async function openFinishedProject(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto('/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c');
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  const created = await page.evaluate(async () => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    const project = await api.createProject({ prompt: 'A warm studio lamp on a wooden desk.' });
    let job: Job = project.job;
    while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
    const answer: Answer = (await api.getJob(job.id)).steps.find(
      (step: { answer?: Answer }) => step.answer,
    ).answer;
    return { projectId: project.project.id as string, answerId: answer.id };
  });
  await page.goto(`/projects/${created.projectId}`);
  await expect(page.locator('[data-id$=":v1"]')).toBeVisible();
  return created;
}

async function savedVerification(page: Page, answerId: string) {
  return page.evaluate(async (id) => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    return (await api.getAnswer(id)).answer as Answer;
  }, answerId);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('verification criteria open in place, turn off without a preview and stay off after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { answerId } = await openFinishedProject(page);
  const before = await savedVerification(page, answerId);
  const criteria = before.verification!.criteria;
  expect(criteria.length).toBeGreaterThan(1);
  const first = criteria[0]!;

  const closed = page.locator('[data-id$=":v1"] .canvas-card');
  await closed.focus();
  await shot(page, '01-closed');
  await closed.click();
  const panel = page.locator('[data-id$=":v1"] .node-open[data-kind="criterion"]');
  await expect(panel).toBeVisible();
  // 기준 묶음 전체가 한 카드로 펼쳐진다
  await expect(panel.getByRole('switch')).toHaveCount(criteria.length);
  const toggle = panel.getByRole('switch', { name: `Include: ${first.text}` });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
  await shot(page, '02-open');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(toggle).toBeEnabled();
  await expect
    .poll(async () => (await savedVerification(page, answerId)).verification!.criteria[0]!.enabled)
    .toBe(false);
  await shot(page, '03-turned-off');

  // 검증 기록은 미리보기·새 버전이 아니다
  const saved = await savedVerification(page, answerId);
  expect(saved.nodes).toEqual(before.nodes);
  expect(saved.number).toBe(before.number);
  await expect(page.locator('.canvas-answer-versions [aria-live=polite]')).toHaveText('Answer 01');
  await expect(page.getByRole('button', { name: 'Apply the fix' })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(closed).toHaveAttribute('data-enabled', 'false');
  await expect(closed.locator('.canvas-output-text')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
  await expect(page.locator('[data-id$=":v2"] .canvas-card')).toHaveAttribute(
    'data-enabled',
    'true',
  );
  await shot(page, '04-closed-strikethrough');

  await page.reload();
  await expect(closed).toHaveAttribute('data-enabled', 'false');
  await expect(closed.locator('.canvas-output-text')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
  await shot(page, '05-after-reload');

  // 다시 생성은 기준을 처음 값(켜짐)으로 되돌려 저장한다
  await closed.click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Regenerate' }).click();
  await expect(panel.getByRole('switch', { name: `Include: ${first.text}` })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect
    .poll(async () => (await savedVerification(page, answerId)).verification!.criteria[0]!.enabled)
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(closed).toHaveAttribute('data-enabled', 'true');
  expect(errors).toEqual([]);
});

test('a failed verification save rolls back and shows the common error', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  const { answerId } = await openFinishedProject(page);
  const first = (await savedVerification(page, answerId)).verification!.criteria[0]!;
  const closed = page.locator('[data-id$=":v1"] .canvas-card');
  await closed.click();
  const panel = page.locator('[data-id$=":v1"] .node-open[data-kind="criterion"]');
  await expect(panel).toBeVisible();
  // 다음 저장 한 번만 서버 오류로 실패시킨다.
  await page.evaluate(async () => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    const original = api.updateVerification;
    api.updateVerification = async () => {
      api.updateVerification = original;
      const { ApiRequestError } = await import(/* @vite-ignore */ path);
      throw new ApiRequestError(500, { code: 'INTERNAL', message: 'x', retryable: true });
    };
  });
  const toggle = panel.getByRole('switch', { name: `Include: ${first.text}` });
  await toggle.click();
  await expect(panel.getByRole('alert')).toHaveText('Something went wrong.');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await shot(page, '06-error-rollback');
  expect((await savedVerification(page, answerId)).verification!.criteria[0]!.enabled).toBe(true);
});
