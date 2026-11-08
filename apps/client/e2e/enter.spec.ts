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
