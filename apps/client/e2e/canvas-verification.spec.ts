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

test('verification criteria take comments as one group, from the closed and the open node tool (#241)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { answerId } = await openFinishedProject(page);
  const head = page.locator('[data-id$=":v1"]');
  // 닫힌 묶음: 노드 도구에 코멘트 버튼이 있다.
  await head.locator('.canvas-card').focus();
  await head.getByRole('button', { name: 'Add a comment: Verification criteria' }).click();
  const corner = head.getByRole('button', { name: /^Comments( \(\d+\))?: Verification criteria$/ });
  await expect(corner).toBeFocused();
  await page.keyboard.press('Enter');
  const input = head.getByRole('textbox', { name: 'Add a comment: Verification criteria' });
  await input.fill('The lamp check matters most.');
  await page.keyboard.press('Enter');
  await expect(head.getByRole('status')).toHaveText('Comment saved.');
  await page.screenshot({ path: info.outputPath('01-criteria-comment.png') });

  // 펼친 기준 묶음(둘째 줄을 눌러 열어도)의 노드 도구에도 코멘트 버튼이 있고, 묶음 첫 줄에 모인다.
  await page.locator('[data-id$=":v2"] .canvas-card').click();
  const panel = head.locator('.node-open[data-kind="criterion"]');
  await expect(panel).toBeVisible();
  await page.screenshot({ path: info.outputPath('02-criteria-open-tool.png') });
  await panel.getByRole('button', { name: 'Add a comment' }).click();
  await expect(panel).toHaveCount(0);
  await expect(corner).toBeFocused();
  await page.keyboard.press('Enter');
  await input.fill('Second reason.');
  await page.keyboard.press('Enter');
  await expect(head.getByRole('status')).toHaveText('Comment saved.');

  const saved = await page.evaluate(async (id) => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    return (await api.listNodeComments(id)).comments as { nodeId: string; body: string }[];
  }, answerId);
  expect(saved.map((comment) => [comment.nodeId, comment.body])).toEqual([
    ['v1', 'The lamp check matters most.'],
    ['v1', 'Second reason.'],
  ]);
  // 띠를 다시 펼치면 두 코멘트가 오래된 순으로 보인다.
  await corner.click();
  const thread = head.getByRole('group', { name: 'Comments: Verification criteria' });
  await expect(thread.getByRole('listitem')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('03-criteria-thread.png') });
  expect(errors).toEqual([]);
});
