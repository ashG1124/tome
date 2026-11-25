import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

// #230: 노드 끌어 옮기기 · 표시 정리 · 코멘트 제자리 펼침 · 답변 카드 크게 보기
async function openFinished(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto('/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c');
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  const projectId = await page.evaluate(async () => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    const created = await api.createProject({ prompt: 'A warm studio lamp on a wooden desk.' });
    let job: Job = created.job;
    while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
    (await api.getJob(job.id)).steps.find((step: { answer?: Answer }) => step.answer);
    return created.project.id as string;
  });
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('.canvas-answer-versions')).toBeVisible();
  // 첫 화면은 4·5단계 쪽으로 확대돼 있다. 한 단계 줄여 프롬프트~답변이 모두 보이게 한다.
  await page.locator('[data-canvas-card$=":k1"]').focus();
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  // 화면 이동·확대가 끝나 viewport 가 멈출 때까지 기다린다.
  const viewport = page.locator('.react-flow__viewport');
  let previous = '';
  await expect
    .poll(async () => {
      const current = (await viewport.getAttribute('style')) ?? '';
      const stable = current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
}

const node = (page: Page, suffix: string) =>
  page.locator(`.react-flow__node[data-id$=":${suffix}"]`);

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error('no box');
  return result;
}

/** 노드 가운데를 잡고 (dx, dy) 만큼 끈다. */
async function drag(page: Page, locator: Locator, dx: number, dy: number) {
  const start = await box(locator);
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 });
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/** 끌기는 문턱(4px)을 넘은 뒤부터 노드를 옮기므로, 커서가 움직인 거리보다 문턱만큼 덜 움직일 수 있다. */
function moved(actual: number, cursor: number) {
  expect(Math.abs(actual - cursor), `${actual} ≈ ${cursor}`).toBeLessThanOrEqual(8);
}

function near(actual: number, expected: number, tolerance = 2) {
  expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);
}

test('upper nodes carry their lower nodes; lower nodes do not move alone; clicks still open', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFinished(page);

  const pill1 = node(page, 'analyze-heading');
  const pill2 = node(page, 'research-heading');
  const k1 = node(page, 'k1');
  const k2 = node(page, 'k2');
  const prompt = node(page, 'prompt');
  const before = {
    pill1: await box(pill1),
    pill2: await box(pill2),
    k1: await box(k1),
    k2: await box(k2),
    prompt: await box(prompt),
  };

  // 1단계 알약을 끌면 1단계 열 전체가 함께 움직인다. 2단계·프롬프트는 그대로다.
  await drag(page, pill1, 60, 90);
  const afterPill = { pill1: await box(pill1), k1: await box(k1), k2: await box(k2) };
  const pillDx = afterPill.pill1.x - before.pill1.x;
  const pillDy = afterPill.pill1.y - before.pill1.y;
  moved(pillDx, 60);
  moved(pillDy, 90);
  near(afterPill.k1.x - before.k1.x, pillDx);
  near(afterPill.k1.y - before.k1.y, pillDy);
  near(afterPill.k2.y - before.k2.y, pillDy);
  near((await box(pill2)).y, before.pill2.y);
  near((await box(prompt)).x, before.prompt.x);
  // 끌기는 노드를 열지 않는다.
  await expect(page.locator('.node-open')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('01-step-column-dragged.png') });

  // 아래 노드(k1)를 끌면 노드가 따로 움직이지 않고 캔버스가 움직인다(알약과의 거리가 그대로).
  const gap = (await box(k1)).y - (await box(pill1)).y;
  await drag(page, k1, 0, 70);
  near((await box(k1)).y - (await box(pill1)).y, gap);
  await expect(page.locator('.node-open')).toHaveCount(0);

  // 묶음 소제목(Search priority)을 끌면 그 묶음만 움직인다. 같은 열 다른 묶음(Data type)은 그대로다.
  const priorityLabel = node(page, 'research-group-1');
  const s1 = node(page, 's1');
  const d1 = node(page, 'd1');
  const groupBefore = {
    s1: await box(s1),
    d1: await box(d1),
    label: await box(priorityLabel),
    pill2: await box(pill2),
  };
  await drag(page, priorityLabel, 40, 60);
  const labelDx = (await box(priorityLabel)).x - groupBefore.label.x;
  const labelDy = (await box(priorityLabel)).y - groupBefore.label.y;
  moved(labelDx, 40);
  moved(labelDy, 60);
  near((await box(s1)).x - groupBefore.s1.x, labelDx);
  near((await box(s1)).y - groupBefore.s1.y, labelDy);
  near((await box(d1)).y, groupBefore.d1.y);

  // 누르기(움직이지 않음)는 여전히 노드를 연다. 펼친 동안에는 알약을 끌어도 열이 움직이지 않는다.
  await k1.locator('[data-canvas-card]').click();
  await expect(k1.locator('.node-open')).toBeVisible();
  const openGap = (await box(k2)).y - (await box(pill1)).y;
  const pillToPill = (await box(pill2)).x - (await box(pill1)).x;
  await drag(page, pill1, 0, 80);
  near((await box(pill2)).x - (await box(pill1)).x, pillToPill);
  near((await box(k2)).y - (await box(pill1)).y, openGap);
  await k1.getByRole('slider', { name: 'Weighting', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.node-open')).toHaveCount(0);

  // 접은 뒤 실제 높이로 다시 쌓아도 끌어 둔 묶음 자리는 남는다.
  await expect
    .poll(async () => (await box(s1)).y - (await box(pill2)).y)
    .toBeCloseTo(groupBefore.s1.y + labelDy - groupBefore.pill2.y, 0);
  near((await box(s1)).x - (await box(pill2)).x, groupBefore.s1.x + labelDx - groupBefore.pill2.x);

  // 프롬프트 노드는 혼자 움직이고, 곡선도 따라간다.
  const edge = page.locator('.react-flow__edge[data-id$=":prompt->analyze-heading"] path').first();
  const pathBefore = await edge.getAttribute('d');
  const pillNow = await box(pill1);
  const promptNow = await box(prompt);
  await drag(page, prompt, -30, -50);
  moved((await box(prompt)).y - promptNow.y, -50);
  near((await box(pill1)).y, pillNow.y);
  expect(await edge.getAttribute('d')).not.toBe(pathBefore);

  // 답변 카드도 혼자 움직이고, 끌기는 크게 보기를 열지 않는다.
  const answer = node(page, 'answer');
  const answerNow = await box(answer);
  await drag(page, answer.locator('.canvas-image-slot'), -40, 30);
  moved((await box(answer)).x - answerNow.x, -40);
  near((await box(pill1)).y, pillNow.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('02-group-prompt-answer-dragged.png') });

  // 키보드 이동은 그대로다.
  await page.locator('[data-canvas-card$=":prompt"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-canvas-card$=":k1"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test('step 3 and step 5 nodes no longer show Model knowledge / Not measured', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFinished(page);
  await expect(node(page, 'e1')).toBeVisible();
  await expect(page.getByText('Model knowledge', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Not measured', { exact: true })).toHaveCount(0);
  await expect(page.locator('.canvas-card small')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('03-no-source-notes.png') });
});

test('clicking or pressing Enter on the answer card opens the image view with Download', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openFinished(page);
  const card = page.locator('[data-canvas-card$=":answer"]');
  await card.locator('.canvas-image-slot').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('04-answer-image-view.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // 모달을 닫아도 캔버스에 머물고, 포커스는 답변 카드로 돌아온다.
  await expect(page).toHaveURL(/\/projects\//);
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible();
  // 버전 버튼(핀·^v)은 모달을 열지 않는다.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pin answer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`the comment icon grows into the comment box in place (${reducedMotion})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1728, height: 1083 });
    await page.emulateMedia({ reducedMotion });
    await openFinished(page);
    const k1 = node(page, 'k1');
    const tool = k1.getByRole('button', { name: /^Add a comment:/ });
    await tool.focus();
    const toolBox = await box(tool);
    await tool.click();
    const panel = k1.getByRole('region', { name: 'Comments', exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
    expect(await panel.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      reducedMotion === 'reduce' ? 'none' : 'canvas-comments-grow',
    );
    await page.waitForTimeout(400);
    // 창은 코멘트 아이콘 자리(왼쪽 위)에서 펼쳐진다. 창 안 아이콘이 도구 아이콘과 같은 자리다.
    const panelBox = await box(panel);
    near(panelBox.x, toolBox.x, 12);
    near(panelBox.y, toolBox.y, 12);
    const toggle = panel.getByRole('button', { name: 'Close' });
    const toggleBox = await box(toggle);
    near(toggleBox.x, toolBox.x, 6);
    near(toggleBox.y, toolBox.y, 6);
    // 도구 막대는 창 뒤에 숨는다.
    await expect(tool).toBeHidden();
    await page.screenshot({ path: info.outputPath(`05-comment-expanded-${reducedMotion}.png`) });
    const input = panel.getByRole('textbox', { name: 'Add a comment' });
    await input.fill('Make the shade brass.');
    await panel.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText('Comment saved.');
    await expect(panel.getByText('Make the shade brass.', { exact: true })).toBeVisible();
    // Esc 로 아이콘으로 접히고 포커스가 아이콘으로 돌아온다.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(tool).toBeFocused();
  });
}
