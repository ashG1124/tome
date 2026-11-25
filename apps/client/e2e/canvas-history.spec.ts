import { expect, test, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

async function openHistory(page: Page, versions: 1 | 2) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto('/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c');
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  const created = await page.evaluate(async (count) => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    async function finish(initial: Job): Promise<Answer> {
      let job = initial;
      while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
      return (await api.getJob(job.id)).steps.find((step: { answer?: Answer }) => step.answer)
        .answer;
    }
    const project = await api.createProject({ prompt: 'A warm studio lamp on a wooden desk.' });
    const first = await finish(project.job);
    if (count === 2) {
      const nodes = structuredClone(first.nodes);
      const keyword = nodes.nodes.find((node) => node.kind === 'keyword')!;
      keyword.weight = keyword.weight === 9 ? 8 : (keyword.weight ?? 5) + 1;
      const revision = await api.createRevision(first.setId, { baseAnswerId: first.id, nodes });
      const draft = await finish(revision.job);
      await api.acceptAnswer(draft.id);
    }
    return { projectId: project.project.id, firstId: first.id };
  }, versions);
  await page.goto(`/projects/${created.projectId}`);
  await expect(page.locator('.canvas-answer-versions')).toBeVisible();
  return created;
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`comments, versions, pin and reload at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { firstId } = await openHistory(page, 2);
    const versions = page.locator('.canvas-answer-versions');
    await expect(versions.locator('[aria-live=polite]')).toHaveText('Answer 02');
    const previous = page.getByRole('button', { name: 'Previous version' });
    await previous.focus();
    await page.keyboard.press('Enter');
    await expect(versions.locator('[aria-live=polite]')).toHaveText('Answer 01');
    await expect(previous).toBeDisabled();
    const pin = page.getByRole('button', { name: 'Pin answer', exact: true });
    await pin.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Unpin answer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: info.outputPath('01-version-and-pin.png'), fullPage: true });

    const corner = page.locator('[data-id$=":k1"]').getByRole('button', { name: /Add a comment/ });
    await corner.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Comments', exact: true });
    const input = panel.getByRole('textbox', { name: 'Add a comment' });
    await expect(input).toBeFocused();
    const body = 'A'.repeat(300);
    await input.fill(body);
    await expect(panel.getByText('300 / 300')).toBeVisible();
    await panel.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText('Comment saved.');
    await expect(panel.getByText(body, { exact: true })).toBeVisible();
    // 창은 노드 도구 바로 오른쪽에 붙는다(#221)
    const toolBox = (await corner.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeGreaterThan(toolBox.x + toolBox.width);
    expect(panelBox.x - (toolBox.x + toolBox.width)).toBeLessThan(40);
    await page.screenshot({ path: info.outputPath('02-comment-created.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(corner).toBeFocused();

    await page.reload();
    await expect(versions.locator('[aria-live=polite]')).toHaveText('Answer 02');
    // 첫 화면(시안 My work)에서 ^ v 는 화면 오른쪽 밖이다. 포커스하면 캔버스가 답변 카드를 화면 안으로 옮긴다.
    const previousButton = page.getByRole('button', { name: 'Previous version' });
    await previousButton.focus();
    await previousButton.click();
    await expect(versions.locator('[aria-live=polite]')).toHaveText('Answer 01');
    await expect(page.getByRole('button', { name: 'Unpin answer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // 첫 화면은 4·5단계 쪽으로 확대돼 있다. 포커스하면 캔버스가 노드를 화면 안으로 옮기니, 그 뒤에 누른다.
    await corner.focus();
    await corner.click();
    await expect(panel.getByText(body, { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Delete', exact: true }).focus();
    await page.keyboard.press('Enter');
    // 지우기 전에 한 번 더 묻는다. 포커스는 안전한 Cancel 에 온다. Esc 는 질문만 접는다.
    const ask = panel.getByRole('group', { name: 'Delete this comment?' });
    await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ask).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(ask.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel.getByText(body, { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('status')).toHaveText('Comment deleted.');
    await expect(input).toBeFocused();
    await page.screenshot({ path: info.outputPath('03-comment-deleted.png'), fullPage: true });
    await page.keyboard.press('Escape');
    // 코멘트를 보던 중이라 캔버스가 k1 쪽에 있다. 포커스하면 답변 카드가 다시 화면 안으로 온다.
    const next = page.getByRole('button', { name: 'Next version' });
    await next.focus();
    await next.click();
    await expect(versions.locator('[aria-live=polite]')).toHaveText('Answer 02');
    await expect(page.getByRole('button', { name: 'Next version' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Pin answer', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const state = await page.evaluate(async (id) => {
      const path = '/src/shared/api/index.ts';
      const { api } = await import(/* @vite-ignore */ path);
      return {
        comments: (await api.listNodeComments(id)).comments,
        answer: (await api.getAnswer(id)).answer,
      };
    }, firstId);
    expect(state.comments).toEqual([]);
    expect(state.answer.pinned).toBe(true);
    expect(state.answer.verification?.criteria.length).toBeGreaterThan(0);
    expect(await page.locator('.canvas-retry').filter({ hasText: 'Delete' }).count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('one version disables both chevrons and editing remains available', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openHistory(page, 1);
  await expect(page.getByRole('button', { name: 'Previous version' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next version' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('04-single-version.png'), fullPage: true });
  const edit = page.locator('[data-id$=":k1"]').getByRole('button', { name: 'Edit node' });
  await edit.focus();
  await edit.click();
  // 편집은 노드 카드 안에서 제자리로 펼쳐진다(#195)
  await expect(page.locator('[data-id$=":k1"] .node-open')).toBeVisible();
  const dial = page.getByRole('slider', { name: 'Weighting', exact: true });
  await dial.focus();
  await page.keyboard.press('Home');
  const apply = page.getByRole('button', { name: 'Apply the fix', exact: true });
  await expect(apply).toBeEnabled({ timeout: 15000 });
  await apply.click();
  await expect(page.locator('.canvas-answer-versions [aria-live=polite]')).toHaveText('Answer 02');
  await expect(page.getByRole('button', { name: 'Previous version' })).toBeEnabled();
  await expect(page.locator('.node-open')).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('05-editor-apply-and-history.png'),
    fullPage: true,
  });
});

test('comments open from the open node tool, sit next to the node and respect reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHistory(page, 1);
  const node = page.locator('[data-id$=":k1"]');
  const edit = node.getByRole('button', { name: 'Edit node' });
  await edit.focus();
  await edit.click();
  await expect(node.locator('.node-open')).toBeVisible();
  await node.locator('.node-open-tool').getByRole('button', { name: 'Add a comment' }).click();
  // 펼친 노드는 접히고, 창은 그 노드 도구 바로 옆에 열린다.
  await expect(node.locator('.node-open')).toHaveCount(0);
  const panel = node.getByRole('region', { name: 'Comments', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await expect(panel.getByText('No comments yet.')).toBeVisible();
  expect(await panel.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  // 창 전체가 화면 안에 있다.
  const box = (await panel.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(1728);
  expect(box.y + box.height).toBeLessThanOrEqual(1083);
  // 닫으면 노드 옆 코멘트 버튼으로 포커스가 돌아온다(펼친 노드의 버튼은 사라졌다).
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(node.getByRole('button', { name: /^Add a comment:/ })).toBeFocused();
});
