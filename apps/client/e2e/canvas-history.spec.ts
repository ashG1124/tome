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

    // 분홍 코너 코멘트 흐름(#241): 노드 도구 코멘트 아이콘 → 코너 → 코너를 눌러 띠 → 띠 안에서 바로 쓴다.
    const k1 = page.locator('[data-id$=":k1"]');
    const tool = k1.getByRole('button', { name: /^Add a comment:/ });
    await tool.focus();
    await page.keyboard.press('Enter');
    const corner = k1.getByRole('button', { name: /^Comments/ });
    await expect(corner).toBeFocused();
    await expect(corner).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    const input = k1.getByRole('textbox', { name: /^Add a comment:/ });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('placeholder', 'Please provide a reason.');
    // 무거운 이중 테두리 대신 공통 포커스 테두리 하나(띠 둘레)
    const sheet = k1.locator('.canvas-comment-sheet');
    expect(await input.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
    expect(await sheet.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
    const body = 'A'.repeat(300);
    await input.fill(body);
    await expect(k1.getByText('300 / 300')).toBeVisible();
    await page.screenshot({ path: info.outputPath('02a-comment-typing.png') });
    await page.keyboard.press('Enter');
    await expect(k1.getByRole('status')).toHaveText('Comment saved.');
    await expect(input).toHaveCount(0);
    await expect(corner).toBeFocused();
    // 올린 글은 접힌 띠에 두 줄까지 보인다.
    await expect(k1.locator('.canvas-comment-text')).toBeVisible();
    await expect(k1.locator('.canvas-comment-text')).toContainText(body.slice(0, 20));
    await page.screenshot({ path: info.outputPath('02-comment-created.png'), fullPage: true });
    // 코너에서 Esc 는 대상을 풀고 코멘트 아이콘으로 포커스를 돌려준다(코너는 코멘트가 있어 남는다).
    await page.keyboard.press('Escape');
    await expect(tool).toBeFocused();
    await expect(corner).toBeVisible();

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
    const thread = k1.getByRole('group', { name: /^Comments: / });
    await expect(thread.getByText(body, { exact: true })).toBeVisible();
    await expect(input).toBeFocused();
    await thread.getByRole('button', { name: 'Delete', exact: true }).focus();
    await page.keyboard.press('Enter');
    // 지우기 전에 한 번 더 묻는다. 포커스는 안전한 Cancel 에 온다. Esc 는 질문만 접는다.
    const ask = thread.getByRole('group', { name: 'Delete this comment?' });
    await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ask).toHaveCount(0);
    await expect(thread).toBeVisible();
    await expect(thread.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(ask.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(thread.getByText(body, { exact: true })).toHaveCount(0);
    await expect(k1.getByRole('status')).toHaveText('Comment deleted.');
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
  // stack 플래시는 잠깐(2.5초) 보였다가 사라진다(#230). 상태 칸(role=status)은 남는다.
  const flash = page.locator('.canvas-editor-flash [role=status]');
  await expect(flash).toHaveText('This version will be updated as the accepted answer');
  const shown = Date.now();
  await expect(flash).toHaveText('', { timeout: 5000 });
  expect(Date.now() - shown).toBeLessThan(3500);
  await expect(page.locator('.canvas-answer-versions [aria-live=polite]')).toHaveText('Answer 02');
  await expect(page.getByRole('button', { name: 'Previous version' })).toBeEnabled();
  await expect(page.locator('.node-open')).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('05-editor-apply-and-history.png'),
    fullPage: true,
  });
});

test('the open node tool comment button folds the node and makes a corner there (#241)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHistory(page, 1);
  const node = page.locator('[data-id$=":k1"]');
  const edit = node.getByRole('button', { name: 'Edit node' });
  await edit.focus();
  await edit.click();
  await expect(node.locator('.node-open')).toBeVisible();
  await node.locator('.node-open-tool').getByRole('button', { name: 'Add a comment' }).click();
  // 펼친 노드는 접히고, 그 노드 오른쪽 아래에 코너가 생겨 포커스를 받는다.
  await expect(node.locator('.node-open')).toHaveCount(0);
  const corner = node.getByRole('button', { name: /^Comments: / });
  await expect(corner).toBeFocused();
  const card = await node.locator('[data-canvas-card]').boundingBox();
  const cornerBox = await corner.boundingBox();
  expect(Math.abs(cornerBox!.x + cornerBox!.width - (card!.x + card!.width))).toBeLessThan(2);
  expect(Math.abs(cornerBox!.y + cornerBox!.height - (card!.y + card!.height))).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('06-corner-closed.png') });
  await corner.click();
  const input = node.getByRole('textbox', { name: /^Add a comment:/ });
  await expect(input).toBeFocused();
  // 띠 전체가 화면 안에 있다.
  const box = (await node.locator('.canvas-comment-sheet').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(1728);
  expect(box.y + box.height).toBeLessThanOrEqual(1083);
  await page.screenshot({ path: info.outputPath('07-corner-open-guide.png') });
  // Esc 는 띠를 접어 코너로, 한 번 더 누르면 (코멘트가 없으니) 코너도 사라지고 노드 도구의 코멘트 버튼으로 돌아온다.
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(corner).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(corner).toHaveCount(0);
  await expect(node.getByRole('button', { name: /^Add a comment:/ })).toBeFocused();
  // 아무것도 쓰지 않고 다른 곳을 누르면 빈 코너는 거둔다.
  await node.getByRole('button', { name: /^Add a comment:/ }).click();
  await expect(corner).toBeFocused();
  await page.mouse.click(5, 700);
  await expect(corner).toHaveCount(0);
});
