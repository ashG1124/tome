import { expect, test, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

interface SeededConnection {
  nodeId: string;
  predictedAction: string;
}

async function prepare(page: Page, partner: boolean, seed: SeededConnection[] = []) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto('/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c');
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  const created = await page.evaluate(async (usePartner) => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    const candidates = (await api.getRemixCandidates('rising')).creators;
    const project = await api.createProject({
      prompt: 'A warm studio lamp on a wooden desk.',
      ...(usePartner ? { remixPartnerId: candidates[0].id } : {}),
    });
    let job: Job = project.job;
    while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
    const answer: Answer = (await api.getJob(job.id)).steps.find(
      (step: { answer?: Answer }) => step.answer,
    ).answer;
    return {
      projectId: project.project.id,
      answerId: answer.id,
      partners: candidates.map((candidate: { id: string }) => candidate.id),
    };
  }, partner);
  if (seed.length > 0)
    // 가짜 저장소에 이 답변·지금 상대의 Connection 을 미리 넣는다(가짜는 앞쪽 노드 2개에만 만들기 때문)
    await page.evaluate(
      ({ answerId, partnerId, seed }) => {
        const key = 'tome.fake.store.v2';
        const store = JSON.parse(localStorage.getItem(key) ?? '{}') as {
          connections?: object[];
        };
        store.connections = [
          ...(store.connections ?? []),
          ...seed.map((entry, index) => ({
            id: `00000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}`,
            answerId,
            partnerId,
            nodeId: entry.nodeId,
            predictedAction: entry.predictedAction,
            sentence: 'Made bold changes 4 of 6 times',
            status: 'shown',
          })),
        ];
        localStorage.setItem(key, JSON.stringify(store));
      },
      { answerId: created.answerId, partnerId: created.partners[0], seed },
    );
  await page.goto(`/projects/${created.projectId}`);
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  return created;
}

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`shows evidence and offers Apply without a Hide button at ${size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepare(page, true);
    const triggers = page.getByRole('button', { name: /^Connection:/ });
    await expect(triggers).toHaveCount(2);
    const trigger = triggers.first();
    const label = await trigger.getAttribute('aria-label');
    await page.screenshot({ path: info.outputPath('01-connections.png'), fullPage: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Connection', exact: true });
    // 1쪽은 예측(글 버튼에 포커스), 글을 누르면 2쪽에 실제 기록에서 센 근거가 나온다
    const prediction = label!.replace(/^Connection: /, '');
    await expect(panel.getByRole('button', { name: prediction, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      panel.getByText('Leaned on evidence 7 of 10 times', { exact: true }),
    ).toBeVisible();
    // 지금 상대의 것이고 바꿀 값이 있으니 Apply 를 누를 수 있다(잠긴 이유 줄이 없다)
    await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    await expect(panel.locator('.canvas-connection-note')).toHaveCount(0);
    // 숨기기(Hide)는 없다(#229): 말풍선 안 버튼은 글(쪽 넘기기)과 Apply 뿐이다
    await expect(panel.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath('02-evidence-and-apply.png'),
      fullPage: true,
    });
    const rect = await panel.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(size.width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(size.height);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // 표시를 다시 누르면 열리고 한 번 더 누르면 닫힌다. 바깥을 눌러도 닫힌다
    await page.keyboard.press('Space');
    await expect(panel).toBeVisible();
    // 첫 열은 오른쪽으로 열려 말풍선이 표시의 오른쪽 절반을 덮으므로, 남아 있는 왼쪽 위 갈고리를 누른다
    await trigger.click({ position: { x: 5, y: 5 } });
    await expect(panel).toHaveCount(0);
    await trigger.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(size.width / 2, 40);
    await expect(panel).toHaveCount(0);
    await expect(triggers).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}

test('switching partners replaces the Connections, and the chosen partner again cancels the remix (#229)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  const created = await prepare(page, false);
  const triggers = page.getByRole('button', { name: /^Connection:/ });
  await expect(triggers).toHaveCount(0);
  const remix = page.getByRole('button', { name: 'Remix', exact: true });
  await remix.click();
  await page.getByRole('button', { name: /^Lind / }).click();
  await expect(triggers).toHaveCount(2);
  const before = await page.locator('[data-canvas-card]:has(.canvas-connection)').count();
  await remix.click();
  await page.getByRole('button', { name: 'Mara', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mara');
  // 예전 상대의 표시는 사라지고 새 상대의 것으로 바뀐다(겹쳐 쌓이지 않는다)
  await expect(triggers).toHaveCount(2);
  expect(await page.locator('[data-canvas-card]:has(.canvas-connection)').count()).toBe(before);
  for (const card of await page.locator('.canvas-connections').all())
    await expect(card.locator('.canvas-connection')).toHaveCount(1);
  // 새 상대의 것이라 Apply 를 누를 수 있다(예전 상대 안내가 없다)
  await triggers.first().click();
  const panel = page.getByRole('region', { name: 'Connection', exact: true });
  await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('04-switched-partner.png') });
  // 고른 상대를 한 번 더 누르면 리믹스가 풀린다
  await remix.click();
  const mara = page.getByRole('button', { name: 'Mara', exact: true });
  await expect(mara).toHaveAttribute('aria-current', 'true');
  await mara.click();
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Mara');
  await expect(triggers).toHaveCount(0);
  await expect(page.locator('[data-remix-handle]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('04b-remix-cancelled.png') });
  expect(created.partners.length).toBeGreaterThan(1);
});

test('one icon per grouped card and none where Apply has nothing to change (#229)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // a1·s1 은 이미 그 값이라 바꿀 것이 없고(Apply 잠김), v1·v2 는 5단계 검증 기준 한 장 카드의 두 줄이다.
  // 상한(답변당 5개)이 차서 가짜가 따로 만들지 않는다.
  await prepare(page, true, [
    { nodeId: 'k1', predictedAction: 'Lean on evidence' },
    { nodeId: 'a1', predictedAction: 'Keep the change small' },
    { nodeId: 's1', predictedAction: 'Lean on evidence' },
    { nodeId: 'v1', predictedAction: 'Make a bold change' },
    { nodeId: 'v2', predictedAction: 'Make a bold change' },
  ]);
  const triggers = page.getByRole('button', { name: /^Connection:/ });
  await expect(triggers).toHaveCount(2);
  const card = (id: string) => page.locator(`[data-id$=":${id}"]`);
  await expect(card('k1').locator('.canvas-connection')).toHaveCount(1);
  await expect(card('a1').locator('.canvas-connection')).toHaveCount(0);
  await expect(card('s1').locator('.canvas-connection')).toHaveCount(0);
  // 검증 기준 묶음은 첫 줄(카드 왼쪽 위)에만 하나
  await expect(card('v1').locator('.canvas-connection')).toHaveCount(1);
  await expect(card('v2').locator('.canvas-connection')).toHaveCount(0);
  // 묶음 표시도 다른 노드처럼 카드 왼쪽 위 (-33, -33)에 놓인다
  for (const id of ['k1', 'v1']) {
    const trigger = card(id).getByRole('button', { name: /^Connection:/ });
    const t = (await trigger.boundingBox())!;
    const c = (await card(id).locator('[data-canvas-card]').boundingBox())!;
    const scale = t.width / 60;
    expect(Math.abs(c.x - t.x - 33 * scale)).toBeLessThan(2);
    expect(Math.abs(c.y - t.y - 33 * scale)).toBeLessThan(2);
  }
  // 묶음 표시를 열면 다른 노드처럼 표시의 오른쪽 아래 갈고리에 말풍선이 붙고 화면 안에 있다
  const groupTrigger = card('v1').getByRole('button', { name: /^Connection:/ });
  await groupTrigger.click();
  const bubble = page.getByRole('region', { name: 'Connection', exact: true });
  await expect(bubble).toBeVisible();
  const t = (await groupTrigger.boundingBox())!;
  const b = (await bubble.boundingBox())!;
  const scale = t.width / 60;
  expect(Math.abs(b.x + b.width - (t.x + t.width - 30 * scale))).toBeLessThan(2);
  expect(Math.abs(b.y + b.height - (t.y + t.height))).toBeLessThan(2);
  expect(b.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: info.outputPath('10-group-connection.png') });
});

test('closed partner shows the folded handle, which unfolds the Remix with pill (Remix 03 → 04)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await prepare(page, false);
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await page.getByRole('button', { name: /^Lind / }).click();
  const remix = page.getByRole('button', { name: 'Remix', exact: true });
  await expect(remix).toHaveAttribute('aria-expanded', 'false');
  const handle = page.locator('[data-remix-handle]');
  await expect(handle).toHaveAccessibleName('Remix with Lind');
  const button = (await remix.boundingBox())!;
  const knob = (await handle.boundingBox())!;
  // 손잡이 높이 34, 리믹스 버튼과 사이 6, 가운데 맞춤(2513:225783)
  expect(Math.round(knob.height)).toBe(34);
  expect(Math.round(button.x - (knob.x + knob.width))).toBe(6);
  expect(Math.round(knob.y + knob.height / 2)).toBe(Math.round(button.y + button.height / 2));
  await page.screenshot({ path: info.outputPath('05-remix-handle.png') });
  await handle.click();
  const pill = page.getByRole('button', { name: 'Remix with Lind', exact: true });
  await expect(pill).toBeFocused();
  const rect = (await pill.boundingBox())!;
  // 닫힌 알약 247×48, 오른쪽 끝이 리믹스 버튼에서 11 떨어진다(1720:80415, Remix 04)
  expect(Math.round(rect.width)).toBe(247);
  expect(Math.round(rect.height)).toBe(48);
  expect(Math.round(button.x - (rect.x + rect.width))).toBe(11);
  await page.screenshot({ path: info.outputPath('06-remix-pill.png') });
  await page.keyboard.press('Escape');
  await expect(handle).toBeFocused();
  await handle.click();
  await page.getByRole('button', { name: 'Remix with Lind', exact: true }).click();
  await expect(remix).toHaveAttribute('aria-expanded', 'true');
});

test('Connection sits on the node top-left corner and its bubble keeps the corner hook', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await prepare(page, true);
  const trigger = page.getByRole('button', { name: /^Connection:/ }).first();
  const card = trigger.locator('xpath=ancestor::*[@data-canvas-card][1]');
  const t = (await trigger.boundingBox())!;
  const c = (await card.boundingBox())!;
  // 시안 1187:61097: 60×60 표시가 노드 왼쪽 위에서 (-33, -33). 캔버스 배율만큼 줄어든다
  const scale = t.width / 60;
  expect(Math.abs(c.x - t.x - 33 * scale)).toBeLessThan(2);
  expect(Math.abs(c.y - t.y - 33 * scale)).toBeLessThan(2);
  await trigger.click();
  const bubble = page.getByRole('region', { name: 'Connection', exact: true });
  await expect(bubble).toBeVisible();
  const b = (await bubble.boundingBox())!;
  // 첫 열은 왼쪽 자리가 없어 오른쪽으로 연다: 말풍선 왼쪽 위가 표시의 왼쪽 위 갈고리 바로 오른쪽(30)에 붙는다
  expect(Math.abs(b.x - (t.x + 30 * scale))).toBeLessThan(2);
  expect(Math.abs(b.y - t.y)).toBeLessThan(2);
  expect(b.x + b.width).toBeLessThanOrEqual(1536);
});

test('Apply → node value → preview → Apply the fix makes a new version and marks it applied (#151)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  const { answerId } = await prepare(page, true);
  await page
    .getByRole('button', { name: /^Connection:/ })
    .first()
    .click();
  const panel = page.getByRole('region', { name: 'Connection', exact: true });
  await panel.getByRole('button', { name: 'Apply', exact: true }).dblclick();
  await expect(panel.getByRole('button', { name: 'Applied', exact: true })).toBeDisabled();
  const fix = page.getByRole('button', { name: 'Apply the fix', exact: true });
  await expect(fix).toBeEnabled({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath('07-apply-preview.png') });
  const revisions = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('tome.fake.store.v2') ?? '{}') as {
      jobs: { revision?: { appliedConnectionIds?: string[] } }[];
    };
    return store.jobs.flatMap((job) => (job.revision ? [job.revision.appliedConnectionIds] : []));
  });
  // 연타해도 revise 는 한 번이고, 고른 Connection id 를 실었다
  expect(revisions).toHaveLength(1);
  expect(revisions[0]).toHaveLength(1);
  await fix.click();
  // 새 버전이 확정되면 미리보기 세션이 끝나 Apply the fix 는 다시 잠긴다
  await expect(fix).toBeDisabled();
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const path = '/src/shared/api/index.ts';
        const { api } = await import(/* @vite-ignore */ path);
        return (await api.listConnections(id)).connections.map(
          (connection: { status: string }) => connection.status,
        );
      }, answerId),
    )
    .toContain('applied');
  await page.screenshot({ path: info.outputPath('08-new-version.png') });
});

test('empty page with a partner shows the partner chip and "Start a new project with" (4898:93342)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto('/projects/0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c');
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  const projectId = await page.evaluate(async () => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    const candidates = (await api.getRemixCandidates('rising')).creators;
    return (await api.createProject({ remixPartnerId: candidates[0].id })).project.id;
  });
  await page.goto(`/projects/${projectId}`);
  const chip = page.locator('[data-remix-opener]');
  await expect(chip).toHaveAccessibleName('Remix with Lind');
  await expect(page.locator('textarea')).toHaveAttribute(
    'placeholder',
    'Start a new project with Lind',
  );
  const box = (await chip.boundingBox())!;
  expect(Math.round(box.width)).toBe(40);
  expect(Math.round(box.height)).toBe(40);
  await page.screenshot({ path: info.outputPath('09-prompt-remix.png') });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('group', { name: 'Remix with' })).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
});
