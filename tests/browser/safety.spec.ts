import { test, expect, type Page } from '@playwright/test';
async function readJsonDownload(page: Page, button: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const stream = await (await download).createReadStream();
  let content = '';
  for await (const chunk of stream!) content += chunk;
  return JSON.parse(content);
}
test('unsaved pendulum series asks before leaving; declining keeps it', async ({ page }) => {
  await page.goto('/#pendulum');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByLabel('Общее время, с', { exact: true }).fill('14,2');
  await page.getByRole('button', { name: 'Добавить попытку' }).click();
  const messages: string[] = [];
  page.once('dialog', (d) => {
    messages.push(d.message());
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  expect(messages[0]).toContain('не сохранена');
  await expect(page.getByText('1 из 5 длин')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Все исследования' }).click();
  await expect(page.getByRole('heading', { name: 'Что исследуем сегодня?' })).toBeVisible();
});
test('export of a saved series matches the stored revision', async ({ page }) => {
  await page.goto('/#pendulum');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Посмотреть учебную серию' }).click();
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const record = await readJsonDownload(page, 'JSON');
    expect(record.revision).toBe(1);
    expect(record.analyses).toHaveLength(1);
  }
  // Saved work navigates without a prompt.
  page.once('dialog', () => {
    throw new Error('Unexpected leave prompt for saved data');
  });
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Дневник исследователя' })).toBeVisible();
});
test('notebook reports unreadable records instead of hiding them', async ({ page }) => {
  await page.goto('/#notebook');
  await expect(page.getByRole('heading', { name: 'Дневник исследователя' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('pocketlab', 1);
        r.onsuccess = () => {
          const tx = r.result.transaction('investigations', 'readwrite');
          tx.objectStore('investigations').put({ id: 'broken-row', schemaVersion: 99 });
          tx.oncomplete = () => {
            r.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Одну запись не удалось прочитать');
  const rows = await readJsonDownload(page, 'Скачать как есть');
  expect(rows).toEqual([{ id: 'broken-row', schemaVersion: 99 }]);
});
