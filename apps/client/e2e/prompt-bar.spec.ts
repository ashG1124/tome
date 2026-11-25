import { expect, test, type Page } from '@playwright/test';

// #228 프롬프트 바 여러 줄 모양·긴 글 정렬, 프롬프트 노드 시안(Node/Prompt 1192:65515)
const SEED = '/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c';
const LONG =
  "Please visualise a scene for a music video I'm making — a girl in a school uniform standing in a wide green grass field, with a single cloud floating in the blue sky directly above her. She's reaching a hand up to try and catch it.";

async function openProjectWithSet(page: Page, prompt = LONG) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto(SEED);
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  const id = await page.evaluate(async (text) => {
    const modulePath = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ modulePath);
    const created = await api.createProject({ prompt: text });
    let job = created.job;
    while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
    return created.project.id as string;
  }, prompt);
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  await expect(page.locator('[data-canvas-card$=":prompt"]')).toHaveCount(1);
}

const textbox = (page: Page) =>
  page.getByRole('textbox', { name: 'Hello. What shall we get started on?' });

/** 입력 알약·클립·+·보내기·입력칸 위치(화면 px) */
async function barGeometry(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Hello. What shall we get started on?"]',
    )!;
    const pill = area.parentElement!;
    const row = pill.closest('.group\\/prompt')!;
    const clip = row.querySelector(':scope > span[aria-hidden="true"]')!;
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    return {
      multiline: pill.hasAttribute('data-prompt-multiline'),
      pill: rect(pill)!,
      text: rect(area)!,
      clip: rect(clip)!,
      plus: rect(pill.querySelector('[data-prompt-plus]')),
      send: rect(pill.querySelector('button[aria-label="Send prompt"]')),
      mic: rect(pill.querySelector('button[aria-label="Voice input"]')),
      scrolls: area.scrollHeight > area.clientHeight,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

for (const viewport of [
  { width: 1728, height: 1117 },
  { width: 1536, height: 960 },
]) {
  test(`one-line keeps today's look and long text switches to the two-row layout at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openProjectWithSet(page);

    const one = await barGeometry(page);
    expect(one.multiline).toBe(false);
    expect(one.pill.height).toBeCloseTo(59, 0);
    expect(one.mic).not.toBeNull();
    expect(one.send).toBeNull();
    // 한 줄: 클립은 알약 가운데
    expect((one.clip.top + one.clip.bottom) / 2).toBeCloseTo(
      (one.pill.top + one.pill.bottom) / 2,
      0,
    );

    await textbox(page).fill(LONG);
    const multi = await barGeometry(page);
    expect(multi.multiline).toBe(true);
    expect(multi.mic).toBeNull();
    // 글은 위쪽 전체 폭(좌우 20), 위 여백 18
    expect(multi.text.left - multi.pill.left).toBeCloseTo(20, 0);
    expect(multi.pill.right - multi.text.right).toBeCloseTo(20, 0);
    expect(multi.text.top - multi.pill.top).toBeCloseTo(18, 0);
    // 아랫줄: 왼쪽 + 는 글 왼쪽과, 오른쪽 보내기는 글 오른쪽과 맞고, 둘은 같은 높이
    expect(multi.plus!.left).toBeCloseTo(multi.text.left, 0);
    expect(multi.send!.right).toBeCloseTo(multi.text.right, 0);
    expect((multi.plus!.top + multi.plus!.bottom) / 2).toBeCloseTo(
      (multi.send!.top + multi.send!.bottom) / 2,
      0,
    );
    expect(multi.plus!.top - multi.text.bottom).toBeCloseTo(12, 0);
    expect(multi.pill.bottom - multi.send!.bottom).toBeCloseTo(18, 0);
    // 여러 줄: 클립은 알약 아래쪽에 맞춘다(시안 1187:61893)
    expect(multi.clip.bottom).toBeCloseTo(multi.pill.bottom, 0);
    // 글이 잘리지 않고, 화면 가로 스크롤도 없다
    expect(multi.scrolls).toBe(false);
    expect(multi.pageOverflow).toBe(false);
    await expect(page.getByText('GPT Image')).toHaveCount(0);

    await page.screenshot({ path: test.info().outputPath(`prompt-bar-${viewport.width}.png`) });
  });
}

test('typing across the wrap point switches layout once and does not bounce back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1728, height: 1117 });
  await openProjectWithSet(page);
  const box = textbox(page);
  await box.focus();
  const states: boolean[] = [];
  const heights: number[] = [];
  for (const word of LONG.split(' ').slice(0, 16)) {
    await page.keyboard.type(`${word} `);
    const geometry = await barGeometry(page);
    states.push(geometry.multiline);
    heights.push(Math.round(geometry.pill.height));
  }
  const firstMulti = states.indexOf(true);
  expect(firstMulti).toBeGreaterThan(0);
  expect(states.slice(firstMulti).every(Boolean)).toBe(true);
  // 알약 높이는 줄어들지 않고 자란다(글을 더하기만 했으므로)
  for (let i = 1; i < heights.length; i += 1)
    expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]!);
  // 모양이 바뀌어도 커서는 입력칸에 남는다
  await expect(box).toBeFocused();

  // 글을 지우면 한 줄 모양으로 돌아온다
  await box.fill('short');
  expect((await barGeometry(page)).multiline).toBe(false);
});

test('the long text stays inside the bar and scrolls inside after the max height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await openProjectWithSet(page);
  await textbox(page).fill(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));
  const geometry = await barGeometry(page);
  expect(geometry.multiline).toBe(true);
  // 입력칸은 화면 높이 40% 에서 멈추고 안에서 스크롤한다
  expect(geometry.text.height).toBeLessThanOrEqual(960 * 0.4 + 1);
  expect(geometry.scrolls).toBe(true);
  expect(geometry.pill.bottom).toBeLessThanOrEqual(960);
  expect(geometry.send!.bottom).toBeLessThanOrEqual(geometry.pill.bottom);
});

test('the send button submits like Enter', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 1117 });
  await openProjectWithSet(page);
  await textbox(page).fill(`A warm studio lamp\non a wooden desk.`);
  const send = page.getByRole('button', { name: 'Send prompt' });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator('[data-canvas-card$=":prompt"]')).toHaveCount(2, { timeout: 15_000 });
  await expect(textbox(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Send prompt' })).toHaveCount(0);
});

test('the prompt node follows Node/Prompt (1192:65515)', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 1117 });
  await openProjectWithSet(page);
  const node = page.locator('[data-canvas-card$=":prompt"]');
  await node.focus();
  const look = await node.evaluate((el) => {
    const style = getComputedStyle(el);
    const head = el.querySelector('.canvas-prompt-head')!;
    const text = el.querySelector('.canvas-prompt-text')!;
    return {
      width: (el as HTMLElement).offsetWidth,
      height: (el as HTMLElement).offsetHeight,
      padding: style.padding,
      radius: style.borderRadius,
      border: style.borderTopColor,
      background: style.backgroundColor,
      shadow: style.boxShadow,
      label: head.textContent,
      labelSize: getComputedStyle(head).fontSize,
      textSize: getComputedStyle(text).fontSize,
      mark: getComputedStyle(head.querySelector('.canvas-prompt-mark')!).color,
    };
  });
  expect(look).toMatchObject({
    width: 400,
    // 시안 그대로의 글(음악 영상 장면)이라 높이도 시안 260 과 같다
    height: 260,
    padding: '24px',
    radius: '20px',
    border: 'rgb(255, 227, 214)',
    background: 'rgb(255, 253, 240)',
    shadow: 'none',
    label: 'Prompt',
    labelSize: '14px',
    textSize: '18px',
    mark: 'rgb(255, 198, 163)',
  });
  // 카드 위에 따로 있던 Prompt 소제목은 없다
  await expect(page.locator('.canvas-heading', { hasText: /^Prompt$/ })).toHaveCount(0);
  const box = (await node.boundingBox())!;
  await page.screenshot({
    path: test.info().outputPath('prompt-node.png'),
    clip: { x: box.x - 24, y: box.y - 24, width: box.width + 48, height: box.height + 48 },
  });
});
