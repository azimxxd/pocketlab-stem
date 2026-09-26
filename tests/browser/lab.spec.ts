import { test, expect } from '@playwright/test';
test('simulation → conclusion → IndexedDB → reload → replay → export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Исследовать звук', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать запись' })).toBeDisabled();
  await page.getByLabel('Нет, изменится только уровень').check();
  await page.getByRole('button', { name: 'Демосигнал', exact: true }).click();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await expect(page.getByRole('button', { name: 'Завершить запись' })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Завершить запись' }).click();
  await expect(page.getByText('Что удалось измерить?')).toBeVisible();
  await expect(page.getByText('Это синтетический сигнал.', { exact: false })).toBeVisible();
  await page.getByLabel('Твой вывод').fill('Частота полосы оставалась постоянной.');
  await page.getByRole('button', { name: 'Сохранить исследование' }).click();
  await expect(page.getByRole('button', { name: 'Сохранено в дневнике' })).toBeVisible();
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByText('Частота полосы оставалась постоянной.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/pocketlab.*json/);
});
test('permission denial has an actionable fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
  });
  await page.goto('/#sound');
  await page.getByLabel('Пока не знаю — проверю').check();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await expect(page.getByRole('alert')).toContainText('Доступ к микрофону отклонён');
  await expect(page.getByRole('button', { name: 'Демосигнал', exact: true })).toBeEnabled();
});
test('motion diagnoses actual events, not API presence', async ({ page }) => {
  // Headless Linux Chromium (CI) may not expose DeviceMotionEvent at all. The test injects its own
  // synthetic events either way, so provide a minimal constructor only when the browser lacks one.
  await page.addInitScript(() => {
    if (typeof DeviceMotionEvent !== 'undefined') return;
    class FakeDeviceMotionEvent extends Event {
      accelerationIncludingGravity: unknown;
      rotationRate: unknown;
      constructor(type: string, init: Record<string, unknown> = {}) {
        super(type);
        this.accelerationIncludingGravity = init.accelerationIncludingGravity ?? null;
        this.rotationRate = init.rotationRate ?? null;
      }
    }
    Object.assign(window, { DeviceMotionEvent: FakeDeviceMotionEvent });
  });
  await page.goto('/#diagnostics');
  await page.getByRole('button', { name: 'Проверить движение' }).click();
  await expect(page.locator('.diagnostic-values')).toBeVisible();
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 },
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        }),
      );
    }
  });
  await expect(page.getByText('Получены данные')).toHaveCount(2);
  await expect(page.getByText('9.80 м/с²')).toBeVisible();
});
test('360px layout stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Исследовать звук', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('leaving a recording releases the audio context', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const contexts: AudioContext[] = [];
    (window as unknown as { testContexts: AudioContext[] }).testContexts = contexts;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    };
  });
  await page.goto('/#sound');
  await page.getByLabel('Пока не знаю — проверю').check();
  await page.getByRole('button', { name: 'Демосигнал', exact: true }).click();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await expect(page.getByRole('button', { name: 'Завершить запись' })).toBeVisible();
  await page.getByRole('button', { name: 'Датчики', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testContexts: AudioContext[] }).testContexts.every(
          (c) => c.state === 'closed',
        ),
      ),
    )
    .toBe(true);
});
