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
test('bottle tone capture runs on the live path and releases the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __contexts: AudioContext[] };
    w.__contexts = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__contexts.push(this);
      }
    };
  });
  await page.goto('/#bottle');
  await page.getByLabel('Станет выше', { exact: true }).check();
  await page.getByRole('button', { name: 'Записать тон' }).click();
  await expect(page.getByRole('button', { name: /Остановить/ })).toBeVisible();
  // The capture stops itself after 5 s.
  await expect(page.getByText('Устойчивый тон', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Записать тон' })).toBeEnabled();
  const states = await page.evaluate(() =>
    (window as unknown as { __contexts: AudioContext[] }).__contexts.map((c) => c.state),
  );
  expect(states).toEqual(['closed']);
});
