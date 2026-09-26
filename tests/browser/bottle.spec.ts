import { test, expect, type Page } from '@playwright/test';
async function readDownload(page: Page, button: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const artifact = await download;
  const stream = await artifact.createReadStream();
  let content = '';
  for await (const chunk of stream!) content += chunk;
  return { name: artifact.suggestedFilename(), content };
}
async function addManual(page: Page, water: string, hz: string) {
  await page.getByLabel('Налито воды, мл', { exact: true }).fill(water);
  await page.getByLabel('Частота, Гц', { exact: true }).fill(hz);
  await page.getByRole('button', { name: 'Добавить попытку', exact: true }).click();
}
test('manual bottle series → inverse-root law → save → resume revision', async ({ page }) => {
  await page.goto('/#bottle');
  await page.getByLabel('Станет выше', { exact: true }).check();
  await page.getByRole('button', { name: 'Ввести частоту' }).click();
  // Helmholtz-like values for a 1500 ml bottle: f ≈ 3960/√V(ml).
  for (const [water, hz] of [
    ['0', '102'],
    ['300', '114,5'],
    ['600', '132'],
    ['900', '161,5'],
    ['1100', '198'],
  ])
    await addManual(page, water, hz);
  await expect(page.getByLabel('Объём бутылки, мл', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Микрофон' })).toBeDisabled();
  await expect(page.locator('.model-summary h3')).toHaveText('Обратно корню объёма');
  await expect(page.locator('.law-reveal')).toBeVisible();
  await page.getByLabel('Вывод исследования').fill('Больше воды — меньше воздуха — выше тон.');
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  const csv = await readDownload(page, 'CSV');
  expect(csv.content).toContain('capacity_m3,water_m3,air_m3');
  expect(csv.content.split('\n')).toHaveLength(8);
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await expect(page.getByText('РУЧНОЙ ВВОД', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Собери музыкальный инструмент' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить исследование' }).click();
  await addManual(page, '600', '131');
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  const json = JSON.parse((await readDownload(page, 'JSON')).content);
  expect(json.revision).toBe(2);
  expect(json.trials).toHaveLength(6);
  expect(json.analyses.at(-1).result.bestModel).toBe('inverse-sqrt');
});
test('bottle simulation is labelled and never mixes with real trials', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#bottle');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Посмотреть учебную серию' }).click();
  await expect(page.getByText('Учебная серия · симуляция', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить попытку' })).toHaveCount(0);
  await expect(page.locator('.discovery .source-label')).toHaveText('СИМУЛЯЦИЯ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const record = JSON.parse((await readDownload(page, 'JSON')).content);
  expect(record.provenance).toBe('simulation');
  expect(record.trials.every((t: { tone: { kind: string } }) => t.tone.kind === 'simulation')).toBe(
    true,
  );
});
test('rejects water that fills the bottle', async ({ page }) => {
  await page.goto('/#bottle');
  await page.getByLabel('Станет ниже', { exact: true }).check();
  await page.getByRole('button', { name: 'Ввести частоту' }).click();
  await page.getByLabel('Налито воды, мл', { exact: true }).fill('1500');
  await page.getByLabel('Частота, Гц', { exact: true }).fill('150');
  await expect(page.getByText('Вода должна быть меньше объёма бутылки.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить попытку' })).toBeDisabled();
});
test('export → import round-trip, duplicates and invalid files', async ({ page, browser }) => {
  await page.goto('/#bottle');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Посмотреть учебную серию' }).click();
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  const exported = await readDownload(page, 'JSON');
  // A fresh browser context has an empty notebook.
  const other = await browser.newPage();
  await other.goto('/#notebook');
  const upload = (content: string, name = exported.name) =>
    other.getByLabel('Файл исследования JSON').setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
  await upload('{ not json');
  await expect(other.getByRole('alert')).toContainText('не является корректным JSON');
  await upload(JSON.stringify({ schemaVersion: 7 }));
  await expect(other.getByRole('alert')).toContainText('Дневник не изменён');
  await upload(exported.content);
  await expect(other.getByRole('status')).toContainText('Импортировано: 1.');
  await upload(exported.content);
  await expect(other.getByRole('status')).toContainText('Уже были в дневнике: 1.');
  await other.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(other.locator('.model-summary h3')).toHaveText('Обратно корню объёма');
  const roundTrip = await readDownload(other, 'JSON');
  expect(JSON.parse(roundTrip.content)).toEqual(JSON.parse(exported.content));
  await other.close();
});
