import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.goto('/#pendulum');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Посмотреть учебную серию' }).click();
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
}
async function backup(page: Page) {
  await page.getByRole('button', { name: 'Подготовить резервную копию' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
  const stream = await (await pending).createReadStream();
  let text = '';
  for await (const chunk of stream!) text += chunk;
  return JSON.parse(text);
}
async function upload(page: Page, rows: unknown) {
  await page.getByLabel('Файл исследования JSON').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rows)),
  });
}

test('whole notebook backup restores in another browser, deduplicates and preserves conflicts', async ({
  page,
  browser,
}) => {
  await seed(page);
  const original = await backup(page);
  expect(original).toHaveLength(1);
  const other = await browser.newPage();
  await other.goto('/#notebook');
  await upload(other, original);
  await expect(other.getByRole('status')).toContainText('Импортировано: 1.');
  expect(await backup(other)).toEqual(original);
  await upload(other, original);
  await expect(other.getByRole('status')).toContainText('Уже были в дневнике: 1.');
  await upload(other, [{ ...original[0], conclusion: 'Другой вывод' }]);
  await expect(other.getByRole('status')).toContainText('Сохранено копией');
  const restored = await backup(other);
  expect(restored).toHaveLength(2);
  expect(restored.find((r: any) => r.id === original[0].id)).toEqual(original[0]);
  expect(restored.find((r: any) => r.id !== original[0].id).conclusion).toBe('Другой вывод');
  await other.close();
});

test('quota failure during second write rolls back the entire import and preserves existing data', async ({
  page,
}) => {
  await seed(page);
  const original = await backup(page);
  const ids = await page.evaluate(() => [crypto.randomUUID(), crypto.randomUUID()]);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'investigations' && ++writes === 2) {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Injected full storage', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  const incoming = ids.map((id) => ({ ...original[0], id }));
  await upload(page, incoming);
  await expect(page.getByRole('alert')).toContainText('Недостаточно места');
  expect(await backup(page)).toEqual(original);
  await upload(page, incoming);
  await expect(page.getByRole('status')).toContainText('Импортировано: 2.');
  expect(await backup(page)).toHaveLength(3);
});

test('backup retains unreadable rows while restore reports and skips them', async ({
  page,
  browser,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pocketlab', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('investigations', 'readwrite');
      tx.objectStore('investigations').put({
        id: 'future-record',
        schemaVersion: 999,
        note: 'Keep me',
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  // Snapshot reads IndexedDB anew; the current UI list has not been reloaded.
  const rows = await backup(page);
  expect(rows).toHaveLength(2);
  expect(rows.find((r: any) => r.id === 'future-record')).toEqual({
    id: 'future-record',
    schemaVersion: 999,
    note: 'Keep me',
  });
  const other = await browser.newPage();
  await other.goto('/#notebook');
  await upload(other, rows);
  await expect(other.getByRole('status')).toContainText('Импортировано: 1.');
  await expect(other.getByRole('status')).toContainText('Не прошли проверку и пропущены: 1.');
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await other.close();
});
