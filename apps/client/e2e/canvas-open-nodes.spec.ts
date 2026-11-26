import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

// #261: 노드 여러 개 펼쳐 두기 · 펼친 노드 아래 노드 겹침 · 가중치 끌기 방향 · Preview 이전/다음
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
  await still(page.locator('.react-flow__viewport'), 'style');
}

/** 그 속성 값이 더는 바뀌지 않을 때까지 기다린다(화면 이동·확대가 끝남). */
async function still(locator: Locator, attribute: string) {
  let previous = '';
  await expect
    .poll(async () => {
      const current = (await locator.getAttribute(attribute)) ?? '';
      const stable = current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
}

const node = (page: Page, suffix: string) =>
  page.locator(`.react-flow__node[data-id$=":${suffix}"]`);
const card = (page: Page, suffix: string) => node(page, suffix).locator('[data-canvas-card]');
const opened = (page: Page, suffix: string) => node(page, suffix).locator('.node-open');

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error('no box');
  return result;
}

/** 1단계 열(k1 과 같은 세로줄)의 노드를 위에서 아래로. 펼침·밀어내기가 끝나 멈춘 값을 준다. */
async function column(page: Page) {
  const read = () =>
    page.evaluate(() => {
      const anchor = document
        .querySelector('.react-flow__node[data-id$=":k1"]')!
        .getBoundingClientRect();
      const center = anchor.left + anchor.width / 2;
      return [...document.querySelectorAll<HTMLElement>('.react-flow__node')]
        .map((element) => ({ id: element.dataset.id ?? '', rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.height > 0 && rect.left <= center && rect.right >= center)
        .map(({ id, rect }) => ({ id, top: rect.top, bottom: rect.bottom }))
        .sort((a, b) => a.top - b.top);
    });
  let previous = '';
  await expect
    .poll(async () => {
      const current = JSON.stringify(await read());
      const stable = current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
  return read();
}

/** 위 노드의 아래끝이 바로 아래 노드의 위끝을 넘은 쌍(겹침). 없어야 한다. */
function overlaps(nodes: Awaited<ReturnType<typeof column>>) {
  const pairs: string[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const above = nodes[index - 1]!;
    const below = nodes[index]!;
    if (above.bottom > below.top + 1) pairs.push(`${above.id} > ${below.id}`);
  }
  return pairs;
}

/** 캔버스의 빈 곳(노드·패널이 없는 바탕)을 한 번 누른다. */
async function clickPane(page: Page) {
  const point = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')!;
    const rect = pane.getBoundingClientRect();
    for (let y = rect.bottom - 12; y > rect.top; y -= 24)
      for (let x = rect.left + 12; x < rect.right; x += 24)
        if (document.elementFromPoint(x, y) === pane) return { x, y };
    return null;
  });
  if (!point) throw new Error('no empty spot on the canvas');
  await page.mouse.click(point.x, point.y);
}

test('several nodes stay open; the pane or another node does not close them; clicking an open node again closes only that one (#261)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await openFinished(page);
  await card(page, 'k1').click();
  await expect(opened(page, 'k1')).toBeVisible();
  // 다른 노드를 열어도 앞의 노드는 그대로 열려 있다.
  await card(page, 'k2').click();
  await expect(opened(page, 'k2')).toBeVisible();
  await expect(opened(page, 'k1')).toBeVisible();
  await expect(page.locator('.node-open')).toHaveCount(2);
  // 빈 곳을 눌러도 닫히지 않는다.
  await column(page);
  await clickPane(page);
  await expect(page.locator('.node-open')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('01-two-nodes-open.png') });

  // 펼친 노드 안의 숫자 휠을 누르는 것은 닫기가 아니다.
  await opened(page, 'k2').locator('.node-edit-dial').click();
  await expect(page.locator('.node-open')).toHaveCount(2);
  // 펼친 노드를 다시 누르면 그 노드만 닫힌다.
  await opened(page, 'k1').locator('.node-open-title').click();
  await expect(opened(page, 'k1')).toHaveCount(0);
  await expect(opened(page, 'k2')).toBeVisible();
  // Esc 는 포커스가 있는 그 노드만 닫는다.
  await card(page, 'k1').click();
  await expect(page.locator('.node-open')).toHaveCount(2);
  await opened(page, 'k1').getByRole('slider', { name: 'Weighting', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(opened(page, 'k1')).toHaveCount(0);
  await expect(opened(page, 'k2')).toBeVisible();
  await opened(page, 'k2').locator('.node-open-title').click();
  await expect(page.locator('.node-open')).toHaveCount(0);
});

test('opening the node right below an open node pushes the nodes under it; nothing overlaps (#261)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await openFinished(page);
  const before = await column(page);
  expect(overlaps(before)).toEqual([]);
  expect(before.length).toBeGreaterThan(3);

  await card(page, 'k1').click();
  await expect(opened(page, 'k1')).toBeVisible();
  expect(overlaps(await column(page))).toEqual([]);
  // 펼친 노드 바로 아래 노드를 연다.
  await card(page, 'k2').click();
  await expect(opened(page, 'k2')).toBeVisible();
  const both = await column(page);
  expect(overlaps(both)).toEqual([]);
  expect(both.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
  await page.screenshot({ path: info.outputPath('02-open-below-open.png') });

  // 위 노드만 닫아도, 아래 노드만 닫아도 겹치지 않는다.
  await opened(page, 'k1').locator('.node-open-title').click();
  await expect(opened(page, 'k1')).toHaveCount(0);
  expect(overlaps(await column(page))).toEqual([]);
  await card(page, 'k1').click();
  await expect(opened(page, 'k1')).toBeVisible();
  await opened(page, 'k2').locator('.node-open-title').click();
  await expect(opened(page, 'k2')).toHaveCount(0);
  expect(overlaps(await column(page))).toEqual([]);

  // 모두 닫으면 노드 사이 간격이 처음과 같다.
  await opened(page, 'k1').locator('.node-open-title').click();
  await expect(page.locator('.node-open')).toHaveCount(0);
  const after = await column(page);
  const gaps = (nodes: typeof after) =>
    nodes.slice(1).map((entry, index) => Math.round(entry.top - nodes[index]!.bottom));
  expect(overlaps(after)).toEqual([]);
  for (const [index, gap] of gaps(after).entries())
    expect(Math.abs(gap - gaps(before)[index]!)).toBeLessThanOrEqual(1);
});

test('dragging the weight dial left raises the weight and right lowers it (#261)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await openFinished(page);
  await card(page, 'k1').click();
  await expect(opened(page, 'k1')).toBeVisible();
  await column(page);
  const slider = opened(page, 'k1').getByRole('slider', { name: 'Weighting', exact: true });
  // 끌 여유가 양쪽에 있게 가운데 값(5)에서 시작한다.
  await slider.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('5');

  const dial = await box(opened(page, 'k1').locator('.node-edit-dial'));
  const cell = (await box(opened(page, 'k1').locator('.node-edit-dial-current'))).width;
  const x = dial.x + dial.width / 2;
  const y = dial.y + dial.height / 2;
  // 왼쪽으로 두 칸 끌면 2 커진다.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - cell, y, { steps: 5 });
  await expect(slider).toHaveValue('6');
  await page.mouse.move(x - cell * 2, y, { steps: 5 });
  await expect(slider).toHaveValue('7');
  await page.screenshot({ path: info.outputPath('03-dial-dragged-left.png') });
  await page.mouse.up();
  await expect(slider).toHaveValue('7');
  // 오른쪽으로 세 칸 끌면 3 작아진다.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + cell * 3, y, { steps: 9 });
  await page.mouse.up();
  await expect(slider).toHaveValue('4');
  // 끌고 난 뒤에도 노드는 열려 있고, 키보드는 그대로다(→ 늘리기, ← 줄이기).
  await expect(opened(page, 'k1')).toBeVisible();
  await expect(slider).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('5');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('4');
});

test('Preview steps back to the node values before the edit and forward again (#261)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await openFinished(page);
  await card(page, 'k1').click();
  await expect(opened(page, 'k1')).toBeVisible();
  const slider = opened(page, 'k1').getByRole('slider', { name: 'Weighting', exact: true });
  const initial = await slider.inputValue();
  const edited = initial === '9' ? '0' : '9';
  await slider.focus();
  await page.keyboard.press(edited === '9' ? 'End' : 'Home');
  await expect(slider).toHaveValue(edited);

  const panel = page.locator('.node-preview-panel');
  const apply = page.getByRole('button', { name: 'Apply the fix', exact: true });
  await expect(apply).toBeEnabled({ timeout: 15000 });
  const previous = panel.getByRole('button', { name: 'Previous edit', exact: true });
  const next = panel.getByRole('button', { name: 'Next edit', exact: true });
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await expect(panel.locator('.node-preview-image img')).toBeVisible();
  await page.screenshot({ path: info.outputPath('04-preview-ready.png') });

  // 이전: 노드 값이 고치기 전으로 돌아가고, 확정할 미리보기가 없다.
  await previous.click();
  await expect(slider).toHaveValue(initial);
  await expect(apply).toBeDisabled();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(panel.locator('.node-preview-image img')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('05-preview-stepped-back.png') });

  // 다음: 고친 값과 그 미리보기로 돌아온다. 이미 만든 미리보기라 바로 Apply 할 수 있다.
  await next.click();
  await expect(slider).toHaveValue(edited);
  await expect(apply).toBeEnabled();
  await expect(panel.locator('.node-preview-image img')).toBeVisible();
  // 캔버스의 답변은 Apply 하기 전까지 그대로다.
  await expect(page.locator('.canvas-answer-versions [aria-live=polite]')).toHaveText('Answer 01');
});
