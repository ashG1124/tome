import { expect, test, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

async function prepare(page: Page, partner: boolean) {
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
  await page.goto(`/projects/${created.projectId}`);
  await expect(page.getByRole('region', { name: 'Generation canvas' })).toBeVisible();
  return created;
}

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`shows evidence, hides persistently and keeps Apply pending at ${size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { answerId } = await prepare(page, true);
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
    await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await expect(panel.getByText('Apply is not available yet.', { exact: true })).toBeVisible();
    await page.screenshot({
      path: info.outputPath('02-evidence-and-pending-apply.png'),
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
    await page.keyboard.press('Space');
    await panel.getByRole('button', { name: 'Hide', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(triggers).toHaveCount(1);
    await expect(page.getByRole('button', { name: label!, exact: true })).toHaveCount(0);
    const stored = await page.evaluate(async (id) => {
      const path = '/src/shared/api/index.ts';
      const { api } = await import(/* @vite-ignore */ path);
      return (await api.listConnections(id)).connections;
    }, answerId);
    expect(stored.some((connection: { status: string }) => connection.status === 'dismissed')).toBe(
      true,
    );
    await page.reload();
    await expect(triggers).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('03-hidden-after-reload.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('no partner has no Connection and switching partners retains existing Connections', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  const created = await prepare(page, false);
  const triggers = page.getByRole('button', { name: /^Connection:/ });
  await expect(triggers).toHaveCount(0);
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await page.getByRole('button', { name: /^Lind / }).click();
  await expect(triggers).toHaveCount(2);
  const switchPartner = page.getByRole('button', { name: 'Remix', exact: true });
  await switchPartner.click();
  await page.getByRole('button', { name: 'Mara', exact: true }).click();
  await expect(triggers).toHaveCount(4);
  await page.screenshot({
    path: info.outputPath('04-retained-partner-connections.png'),
    fullPage: true,
  });
  expect(created.partners.length).toBeGreaterThan(1);
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
