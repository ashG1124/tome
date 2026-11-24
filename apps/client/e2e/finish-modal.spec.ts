import { expect, test, type Page } from '@playwright/test';
import type { Answer, Job } from '@tome/shared';

/** 고정한 버전이 count 개인 프로젝트를 만들고 완료 모달을 연다. */
async function openFinishModal(page: Page, count: number) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
  await page.goto('/');
  const projectId = await page.evaluate(async (pins) => {
    const path = '/src/shared/api/index.ts';
    const { api } = await import(/* @vite-ignore */ path);
    async function finish(initial: Job): Promise<Answer> {
      let job = initial;
      while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
      return (await api.getJob(job.id)).steps.find((step: { answer?: Answer }) => step.answer)
        .answer;
    }
    const project = await api.createProject({ prompt: 'A warm studio lamp on a wooden desk.' });
    let last = await finish(project.job);
    await api.pinAnswer(last.id, true);
    for (let i = 1; i < pins; i += 1) {
      const nodes = structuredClone(last.nodes);
      const keyword = nodes.nodes.find((node) => node.kind === 'keyword')!;
      keyword.weight = ((keyword.weight ?? 5) + 1) % 10;
      const revision = await api.createRevision(last.setId, { baseAnswerId: last.id, nodes });
      const draft = await finish(revision.job);
      await api.acceptAnswer(draft.id);
      await api.pinAnswer(draft.id, true);
      last = draft;
    }
    return project.project.id as string;
  }, count);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Finish project' }).click();
  const dialog = page.getByRole('dialog', { name: "If you're done, select the final version" });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`finish modal matches the design at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const dialog = await openFinishModal(page, 8);
    const title = dialog.getByRole('textbox', { name: 'Title' });
    const reason = dialog.getByRole('textbox', { name: 'Reasons for Choosing' });
    const toggle = dialog.getByRole('switch', { name: 'Are you going to post this project?' });

    // 잘림 없음: 모달 전체가 화면 안에 있다.
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.height).toBe(639);

    // 열리면 제목 칸에 포커스가 있다(입력 중 모양). 비워 둔 기본 모양을 보려고 포커스를 뺀다.
    await expect(title).toBeFocused();
    await title.blur();
    // 입력칸: 시안 Title Input-Modal(연한 1px 테두리, 높이 48, 모서리 8)
    for (const input of [title, reason]) {
      await expect(input).toHaveCSS('border-top-color', 'rgba(197, 203, 215, 0.5)');
      await expect(input).toHaveCSS('border-top-width', '1px');
      await expect(input).toHaveCSS('border-radius', '8px');
      await expect(input).toHaveCSS('height', '48px');
    }

    // 게시 토글: 50.909×28, 바깥선·그림자 없음, 꺼짐 Card 색
    await expect(toggle).toHaveCSS('border-top-width', '0px');
    await expect(toggle).toHaveCSS('background-color', 'rgb(232, 238, 243)');
    const thumb = toggle.locator('span');
    await expect(thumb).toHaveCSS('box-shadow', 'none');
    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.height).toBe(28);
    expect(Math.round(toggleBox.width * 10) / 10).toBeCloseTo(50.9, 1);

    // 마우스로 누르면 입력 중 진한 테두리만, 안쪽 포커스 사각형 없음
    await title.click();
    await expect(title).toHaveCSS('border-top-color', 'rgb(67, 70, 77)');
    await expect(title).toHaveCSS('outline-style', 'none');
    await title.fill('Studio lamp');

    // 키보드로 들어오면 바깥에 Figma 톤 테두리
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(title).toBeFocused();
    await expect(title).toHaveCSS('outline-style', 'solid');
    await expect(title).toHaveCSS('outline-color', 'rgb(137, 143, 156)');

    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveCSS('background-color', 'rgb(253, 234, 95)');
    await page.screenshot({ path: info.outputPath('finish-modal.png') });

    // 버튼 높이 40(시안 1183:54990)
    for (const name of ['Skip', 'Next']) {
      const button = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(button.height).toBe(40);
      expect(button.width).toBe(160);
    }

    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Complete this Project' });
    await expect(confirm).toBeVisible();
    expect((await confirm.boundingBox())!.height).toBe(172);
    await page.screenshot({ path: info.outputPath('finish-confirm.png') });
  });
}
