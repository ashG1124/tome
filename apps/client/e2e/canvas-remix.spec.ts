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
    await expect(
      panel.getByText('Leaned on evidence 7 of 10 times', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
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
