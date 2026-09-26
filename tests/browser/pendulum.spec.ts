import { test, expect } from '@playwright/test';
async function add(page: import('@playwright/test').Page, length: string, time: string) {
  await page.getByLabel('Длина нити L, м', { exact: true }).fill(length);
  await page.getByLabel('Общее время, с', { exact: true }).fill(time);
  await page.getByRole('button', { name: 'Добавить попытку', exact: true }).click();
}
test('five lengths → models → exclusion audit → save → resume revision', async ({ page }) => {
  await page.goto('/#pendulum');
  await page.getByLabel('Увеличится в 2 раза', { exact: true }).check();
  for (const [length, time] of [
    ['0,20', '8,98'],
    ['0,35', '11,87'],
    ['0,50', '14,19'],
    ['0,75', '17,37'],
    ['1,00', '20,06'],
  ])
    await add(page, length, time);
  await expect(page.locator('.model-summary h3')).toHaveText('Корневая зависимость');
  await expect(page.locator('.law-reveal')).toBeVisible();
  await page.getByRole('button', { name: 'Исключить', exact: true }).first().click();
  await page.getByLabel('Почему исключаем попытку 1?').fill('Сбился при подсчёте');
  await page.getByRole('button', { name: 'Подтвердить исключение' }).click();
  await expect(page.locator('.model-summary h3')).toHaveText('Нужно больше разных условий');
  await expect(page.getByText('4 из 5 длин')).toBeVisible();
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(page.getByText('5 из 5 длин')).toBeVisible();
  await page.getByLabel('Вывод исследования').fill('Данные согласуются с корнем из длины.');
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(
    page.getByText('Данные согласуются с корнем из длины.', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить исследование' }).click();
  await add(page, '0,5', '14,25');
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  const records = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('pocketlab', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return await new Promise<any[]>((resolve, reject) => {
      const r = db.transaction('investigations').objectStore('investigations').getAll();
      r.onsuccess = () => {
        resolve(r.result);
        db.close();
      };
      r.onerror = () => reject(r.error);
    });
  });
  expect(records).toHaveLength(1);
  expect(records[0].revision).toBe(2);
  expect(records[0].trials).toHaveLength(6);
  expect(records[0].analyses).toHaveLength(2);
  expect(records[0].selectionEvents).toHaveLength(2);
  expect(records[0].analyses[0].result.inputTrialIds).toHaveLength(5);
});
test('simulation is visibly separated and exports its provenance', async ({ page }) => {
  await page.goto('/#pendulum');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Посмотреть учебную серию' }).click();
  await expect(page.getByText('Учебная серия · симуляция', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить попытку' })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const artifact = await download;
  const stream = await artifact.createReadStream();
  let content = '';
  for await (const chunk of stream!) content += chunk;
  const record = JSON.parse(content);
  expect(record.provenance).toBe('simulation');
  expect(record.trials).toHaveLength(15);
  expect(record.analyses[0].result.bestModel).toBe('sqrt');
});
test('rejects invalid measurements and works at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#pendulum');
  await page.getByLabel('Увеличится в 4 раза').check();
  await page.getByLabel('Общее время, с', { exact: true }).fill('-2');
  await expect(page.getByRole('button', { name: 'Добавить попытку' })).toBeDisabled();
  await page.getByLabel('Общее время, с', { exact: true }).fill('14,2');
  await page.getByRole('button', { name: 'Добавить попытку' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText('1 из 5 длин')).toBeVisible();
});
test('timer uses measured time and is invalidated on hide', async ({ page }) => {
  await page.goto('/#pendulum');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Запустить таймер' }).click();
  await expect(page.getByLabel('Длина нити L, м', { exact: true })).toBeDisabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('alert')).toContainText('Таймер прерван');
  await expect(page.getByLabel('Общее время, с', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Добавить попытку' })).toBeDisabled();
});
