import { test, expect } from '@playwright/test';

test('saved report prints provenance, expands audit and restores the notebook view', async ({
  page,
}) => {
  await page.goto('/#pendulum');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByRole('button', { name: 'Посмотреть учебную серию' }).click();
  await page.getByLabel('Вывод исследования').fill('Период зависит от корня длины.');
  await page.getByRole('button', { name: 'Сохранить серию' }).click();
  await expect(page.getByRole('button', { name: 'Серия сохранена' })).toBeVisible();
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await page.evaluate(() => {
    window.print = () => window.dispatchEvent(new Event('beforeprint'));
  });
  await page.getByRole('button', { name: 'Печать / PDF' }).click();
  await expect(page.locator('main details:not([open])')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.report-heading')).toBeVisible();
  await expect(page.locator('.report-heading')).toContainText('СИМУЛЯЦИЯ — учебные данные');
  await expect(page.locator('.report-heading')).toContainText('версия 1');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.report-tools')).toBeHidden();
  await expect(
    page.getByText('Период зависит от корня длины.', { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/report-print.png', fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.report-heading')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Печать / PDF' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByText(/СОХРАНЁННАЯ СЕРИЯ/)).toContainText('ВЕРСИЯ 1');
});
