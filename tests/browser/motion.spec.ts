import { test, expect, type Page } from '@playwright/test';
// Sensor events here are synthetic DOM events dispatched by the test, never hardware.
async function stream(page: Page, seconds: number, z = 9.7) {
  await page.evaluate(
    ({ seconds, z }) =>
      new Promise<void>((resolve) => {
        const begin = performance.now();
        const timer = setInterval(() => {
          window.dispatchEvent(
            new DeviceMotionEvent('devicemotion', {
              accelerationIncludingGravity: { x: 0.01, y: -0.02, z },
              rotationRate: { alpha: 0.1, beta: -0.1, gamma: 0 },
              interval: 10,
            }),
          );
          if (performance.now() - begin > seconds * 1000) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      }),
    { seconds, z },
  );
}
test.beforeEach(async ({ page }) => {
  await page.context().grantPermissions(['accelerometer', 'gyroscope']);
});
test('synthetic recording → tilt vs gyroscope → save → notebook → CSV', async ({ page }) => {
  await page.goto('/#motion');
  await expect(page.getByRole('button', { name: 'Начать запись' })).toBeDisabled();
  await page.getByLabel('Ноль — телефон же не движется').check();
  await page.getByRole('button', { name: 'Учебная запись' }).click();
  await expect(page.getByText('Учебная запись · симуляция', { exact: true })).toBeVisible();
  await expect(page.getByText('|a| = 9,81 ± 0,01 м/с²')).toBeVisible();
  await expect(page.getByText('Это синтетическая запись', { exact: false })).toBeVisible();
  const rows = page.locator('.motion-movements tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('согласуются');
  await expect(rows.nth(1)).toContainText('вокруг вертикали');
  await page
    .getByLabel('Вывод исследования')
    .fill('В покое датчик показывает около 9,8, а не ноль.');
  await page.getByRole('button', { name: 'Сохранить исследование' }).click();
  await expect(page.getByRole('button', { name: 'Сохранено в дневнике' })).toBeVisible();
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что чувствует телефон?' })).toBeVisible();
  await expect(page.locator('.motion-movements tbody tr')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const stream = await (await download).createReadStream();
  let csv = '';
  for await (const chunk of stream!) csv += chunk;
  const lines = csv.split('\n');
  expect(lines[2]).toBe('t_s,ax_m_s2,ay_m_s2,az_m_s2,wx_deg_s,wy_deg_s,wz_deg_s');
  expect(lines).toHaveLength(3 + 901);
});
test('live path reports the measured magnitude, not a reference g', async ({ page }) => {
  await page.goto('/#motion');
  await page.getByLabel('Около 9,8 м/с²').check();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await expect(page.getByRole('button', { name: 'Завершить запись' })).toBeVisible();
  await stream(page, 2.6);
  await expect(page.locator('.motion-values')).toContainText('Покой');
  await page.getByRole('button', { name: 'Завершить запись' }).click();
  await expect(page.getByText('|a| = 9,7 ± 0 м/с²')).toBeVisible();
  await expect(page.locator('.timing-card .source-label')).toContainText('ДАТЧИКИ ТЕЛЕФОНА');
  await expect(page.getByText('Учебная запись · симуляция')).toHaveCount(0);
  // After stopping, further events are ignored.
  const before = await page.locator('.motion-results').textContent();
  await stream(page, 0.3, 3);
  expect(await page.locator('.motion-results').textContent()).toBe(before);
});
test('hiding the page interrupts the recording', async ({ page }) => {
  await page.goto('/#motion');
  await page.getByLabel('Пока не знаю — проверю').check();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await stream(page, 0.5);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Запись прервана.', { exact: false })).toBeVisible();
  await expect(page.getByText('Запись короче 2 секунд', { exact: false })).toBeVisible();
});
test('denied permission and no events are explained', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(DeviceMotionEvent, { requestPermission: async () => 'denied' });
  });
  await page.goto('/#motion');
  await page.getByLabel('Пока не знаю — проверю').check();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await expect(page.getByRole('alert')).toContainText('Доступ к движению отклонён');
});
test('no sensor events on a desktop are reported, not invented', async ({ page }) => {
  await page.goto('/#motion');
  await page.getByLabel('Пока не знаю — проверю').check();
  await page.getByRole('button', { name: 'Начать запись' }).click();
  await page.getByRole('button', { name: 'Завершить запись' }).click();
  await expect(page.getByRole('alert')).toContainText('Датчики не прислали данных');
  await expect(page.locator('.motion-results')).toHaveCount(0);
});
test('motion results fit a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#motion');
  await page.getByLabel('Пока не знаю — проверю').check();
  await page.getByRole('button', { name: 'Учебная запись' }).click();
  await expect(page.locator('.motion-movements tbody tr')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
