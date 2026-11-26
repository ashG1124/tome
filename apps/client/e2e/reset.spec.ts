import { expect, test, type Page } from '@playwright/test';

/** 코드 입력 → 동의 → 서가까지 들어가고, 캔버스 자리·홈 배치 값도 이 브라우저에 남겨 둔다. */
async function signInWithSavedState(page: Page) {
  await page.goto('/enter');
  await page.getByRole('textbox').fill('any-code');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('button', { name: 'Agree and start' }).click();
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('tome.home.layout.creator-1', '{"v":1,"cells":{}}');
    localStorage.setItem('tome.canvas.drag.project-1.page-1', '{"v":1,"offsets":{}}');
    localStorage.setItem('other-app.setting', 'keep');
    sessionStorage.setItem('tome.tab', 'x');
  });
}

function tomeKeys(page: Page) {
  return page.evaluate(() => ({
    local: Object.keys(localStorage)
      .filter((key) => key.startsWith('tome.'))
      .sort(),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith('tome.')),
  }));
}

test('Cancel·Esc 로 닫으면 아무것도 지우지 않는다', async ({ page }) => {
  await signInWithSavedState(page);
  const before = await tomeKeys(page);
  expect(before.local).toEqual(
    expect.arrayContaining(['tome.token', 'tome.home.layout.creator-1', 'tome.fake.consented']),
  );

  await page.goto('/reset');
  const open = page.getByRole('button', { name: 'Reset this browser' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Reset this browser?' });
  await expect(dialog).toBeVisible();
  // 되돌릴 수 없는 Reset 이 아니라 Cancel 에 먼저 포커스가 간다.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  expect(await tomeKeys(page)).toEqual(before);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
});

test('Reset 하면 tome. 값이 모두 지워지고 처음 화면에서 "Session reset." 을 알린다', async ({
  page,
}) => {
  await signInWithSavedState(page);

  await page.goto('/reset');
  await page.getByRole('button', { name: 'Reset this browser' }).click();
  await page
    .getByRole('dialog', { name: 'Reset this browser?' })
    .getByRole('button', { name: 'Reset' })
    .click();

  // 처음 화면(세션 없는 / = 랜딩)
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Session reset.' })).toBeVisible();

  expect(await tomeKeys(page)).toEqual({ local: [], session: [] });
  expect(await page.evaluate(() => localStorage.getItem('other-app.setting'))).toBe('keep');

  // 다음 관람객은 코드 입력부터, 동의도 다시 받는다.
  await page.goto('/agora');
  await expect(page).toHaveURL(/\/enter$/);
  await page.getByRole('textbox').fill('any-code');
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByRole('button', { name: 'Agree and start' })).toBeVisible();
});
