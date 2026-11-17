import { expect, test } from '@playwright/test';

test('세션이 없으면 전시 코드 입력 화면으로 간다', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByRole('heading', { name: 'Enter the exhibition code' })).toBeVisible();
});

test('코드 입력 → 동의 → 서가', async ({ page }) => {
  await page.goto('/enter');
  await page.getByRole('textbox').fill('any-code');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('button', { name: 'Agree and start' }).click();
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
});

test('키보드만으로 코드 입력 → 동의 → 서가, 포커스 테두리가 보인다', async ({ page }) => {
  await page.goto('/enter');

  // Tab 으로 입력칸에 들어가면 포커스 테두리가 보여야 한다.
  await page.keyboard.press('Tab');
  const code = page.getByRole('textbox', { name: 'Enter the exhibition code' });
  await expect(code).toBeFocused();
  await expect(code).toHaveCSS('outline-style', 'solid');

  await page.keyboard.type('any-code');
  await page.keyboard.press('Enter');

  // 동의 모달이 열리면 동의 버튼에 포커스가 간다.
  const agree = page.getByRole('button', { name: 'Agree and start' });
  await expect(agree).toBeFocused();
  await expect(agree).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
});

test('동의까지 마치면 새로고침해도 서가에 남는다', async ({ page }) => {
  await page.goto('/enter');
  await page.getByRole('textbox').fill('any-code');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('button', { name: 'Agree and start' }).click();
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();

  await page.reload();

  await expect(page).not.toHaveURL(/\/enter$/);
  await expect(page.getByRole('link', { name: 'Neon street at night' })).toBeVisible();
});
