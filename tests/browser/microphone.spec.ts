import { test, expect } from '@playwright/test';
// This uses a browser-provided fake device, not a physical microphone.
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});
test('captures the microphone path and stops it', async ({ page }) => {
  await page.goto('/#sound');
  await page.getByLabel('Нет, изменится только уровень').check();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await expect(page.getByRole('button', { name: 'Завершить запись' })).toBeVisible();
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: 'Завершить запись' }).click();
  await expect(page.getByRole('heading', { name: 'Что удалось измерить?' })).toBeVisible();
  await expect(page.locator('.source-label')).toContainText('МИКРОФОН');
  await expect(page.getByText('Это синтетический сигнал.', { exact: false })).toHaveCount(0);
});
