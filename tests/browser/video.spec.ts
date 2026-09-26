import { test, expect, type Page } from '@playwright/test';
import { FIXTURE, ballAt } from '../fixtures/video-fixture';
// The fixture is a generated VP9/MP4 clip with known motion and variable frame intervals; it
// exercises the real decode, seek and container-timing path but is not a filmed experiment.
const FILE = 'tests/fixtures/video/throw-vfr.mp4';
async function clickVideo(page: Page, x: number, y: number) {
  const canvas = page.getByLabel('Кадр видео. Нажатие ставит отметку выбранного инструмента.');
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: (x / FIXTURE.width) * box.width, y: (y / FIXTURE.height) * box.height },
  });
}
async function open(page: Page, mode: 'flight' | 'bounce' = 'flight') {
  await page.goto('/#video');
  if (mode === 'bounce') await page.getByRole('button', { name: 'Отскок', exact: true }).click();
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByLabel('Видеофайл').setInputFiles(FILE);
  await expect(page.locator('.video-info')).toContainText(`${FIXTURE.times.length}`);
}
async function markFlight(page: Page, frames: number) {
  await clickVideo(page, FIXTURE.ruler.x, FIXTURE.ruler.y1);
  await clickVideo(page, FIXTURE.ruler.x, FIXTURE.ruler.y2);
  await page.getByLabel('Длина отрезка масштаба, м').fill('0,5');
  for (let i = 0; i < frames; i++) {
    await expect(page.locator('.frame-label')).toContainText(`Кадр ${i + 1}/`);
    const p = ballAt(FIXTURE.times[i]);
    await clickVideo(page, p.x, p.y);
  }
}
test('container timing → scale → marks → g from real frame times → notebook', async ({ page }) => {
  await open(page);
  await expect(page.locator('.video-info')).toContainText('из файла');
  await expect(page.locator('.video-info')).toContainText('переменный');
  await page.getByLabel('Обычная съёмка (не замедленная)').check();
  await markFlight(page, 11);
  const heading = page.locator('.video-results .motion-results h3').first();
  await expect(heading).toContainText('g ≈');
  const g = Number((await heading.textContent())!.match(/([\d,]+) м/)![1].replace(',', '.'));
  expect(Math.abs(g - 9.81) / 9.81).toBeLessThan(0.03);
  await expect(page.locator('.video-info')).toContainText('0 расхождений');
  await page.getByLabel('Вывод исследования').fill('Скорость растёт равномерно.');
  await page.getByRole('button', { name: 'Сохранить разметку' }).click();
  await expect(page.getByRole('button', { name: 'Сохранено в дневнике' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const stream = await (await download).createReadStream();
  let json = '';
  for await (const chunk of stream!) json += chunk;
  const record = JSON.parse(json);
  expect(record.video.timebase).toBe('container');
  expect(record.points[3].t).toBeCloseTo(FIXTURE.times[3], 4);
  expect(JSON.stringify(record)).not.toContain('blob:');
  await page.getByRole('button', { name: 'Мой дневник', exact: false }).click();
  await expect(page.getByText('РАЗМЕТКА ВИДЕО', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByText('Видео не сохранялось', { exact: false })).toBeVisible();
  await expect(page.locator('.video-results h3').first()).toContainText('g ≈');
});
test('unknown playback speed disables g but keeps the marks', async ({ page }) => {
  await open(page);
  await markFlight(page, 11);
  await expect(page.locator('.video-results .motion-results h3').first()).toHaveText(
    'g не оценивается',
  );
  await expect(page.locator('.quality-list')).toContainText('Время кадров неизвестно');
  await page.getByLabel('Замедленная съёмка').check();
  await page.getByLabel('Коэффициент замедления').fill('2');
  // Declared 2× slow motion halves real time ⇒ four times the acceleration.
  const heading = page.locator('.video-results .motion-results h3').first();
  await expect(heading).toContainText('g ≈');
  const g = Number((await heading.textContent())!.match(/([\d,]+) м/)![1].replace(',', '.'));
  expect(g / 9.81).toBeGreaterThan(3.7);
});
test('marks can be replaced, flagged and removed; frames step with the table', async ({ page }) => {
  await open(page);
  await clickVideo(page, FIXTURE.ruler.x, FIXTURE.ruler.y1);
  await clickVideo(page, FIXTURE.ruler.x, FIXTURE.ruler.y2);
  await clickVideo(page, 60, 150);
  await expect(page.locator('.frame-label')).toContainText('Кадр 2/');
  await page.getByRole('button', { name: 'Предыдущий кадр' }).click();
  await expect(page.locator('.frame-label')).toContainText(`Кадр 1/${FIXTURE.times.length} · 0 с`);
  await page.getByLabel('Отметка сомнительная').check();
  await expect(page.locator('.video-workspace .subtle')).toContainText('Отметок: 1.');
  await page.getByRole('button', { name: 'Удалить отметку' }).click();
  await expect(page.locator('.video-workspace .subtle')).toContainText('Отметок: 0.');
  await page.getByRole('button', { name: 'Следующий кадр' }).click();
  await expect(page.locator('.frame-label')).toContainText(
    `Кадр 2/${FIXTURE.times.length} · 0,03 с`,
  );
});
test('bounce mode asks for the contact frame', async ({ page }) => {
  await open(page, 'bounce');
  await page.getByLabel('Обычная съёмка (не замедленная)').check();
  await markFlight(page, 6);
  await expect(page.locator('.quality-list')).toContainText('Отметь кадр касания');
});
test('synthetic track needs no video and is labelled', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#video');
  await page.getByLabel('Растёт равномерно').check();
  await page.getByRole('button', { name: 'Учебная разметка' }).click();
  await expect(page.getByText('Учебная разметка · симуляция')).toBeVisible();
  await expect(page.locator('.video-results .motion-results h3').first()).toContainText('g ≈');
  await expect(page.locator('.quality-list')).toContainText('учебная разметка без видео');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('rejects a file that is not a video', async ({ page }) => {
  await page.goto('/#video');
  await page.getByLabel('Пока не знаю — исследую').check();
  await page.getByLabel('Видеофайл').setInputFiles({
    name: 'notes.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not a video'),
  });
  await expect(page.getByRole('alert')).toContainText('не смог открыть');
});
test('auto-tracking follows the ball, stops at loss and keeps its raw run', async ({ page }) => {
  await open(page);
  await page.getByLabel('Обычная съёмка (не замедленная)').check();
  await clickVideo(page, FIXTURE.ruler.x, FIXTURE.ruler.y1);
  await clickVideo(page, FIXTURE.ruler.x, FIXTURE.ruler.y2);
  await page.getByLabel('Длина отрезка масштаба, м').fill('0,5');
  await page.getByRole('button', { name: 'Трекинг' }).click();
  await page.getByLabel('Размер рамки трекинга').fill('12');
  await clickVideo(page, ballAt(0).x, ballAt(0).y);
  await page.getByRole('button', { name: 'Отследить с этого кадра' }).click();
  const status = page.locator('.video-workspace p.subtle[role="status"]');
  await expect(status).toContainText(/потерян|вышел из кадра/, { timeout: 20000 });
  const heading = page.locator('.video-results .motion-results h3').first();
  await expect(heading).toContainText('g ≈');
  const g = Number((await heading.textContent())!.match(/([\d,]+) м/)![1].replace(',', '.'));
  expect(Math.abs(g - 9.81) / 9.81).toBeLessThan(0.03);
  await expect(page.locator('.quality-list')).toContainText('поставлена трекером');
  // Correct one automatic mark by hand: the stored raw run must not change.
  await page.getByRole('button', { name: 'Мяч', exact: true }).click();
  for (let i = 0; i < 20; i++) {
    if ((await page.locator('.frame-label').first().textContent())!.includes('Кадр 5/')) break;
    await page.getByRole('button', { name: 'Предыдущий кадр' }).click();
  }
  await expect(page.locator('.frame-label').first()).toContainText('Кадр 5/');
  const p = ballAt(FIXTURE.times[4]);
  await clickVideo(page, p.x + 1, p.y);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const stream = await (await download).createReadStream();
  let json = '';
  for await (const chunk of stream!) json += chunk;
  const record = JSON.parse(json);
  const run = record.autoRuns[0];
  expect(run.algorithmVersion).toBe('ncc-v1');
  expect(run.points.length).toBeGreaterThanOrEqual(10);
  const raw = run.points.find((q: { frame: number }) => q.frame === 4);
  expect(Math.abs(raw.x - p.x)).toBeLessThan(1);
  const corrected = record.points.find((q: { frame: number }) => q.frame === 4);
  expect(corrected.method).toBe('manual');
  expect(corrected.x).toBeCloseTo(p.x + 1, 0);
  expect(record.points.filter((q: { method: string }) => q.method === 'auto').length).toBe(
    run.points.length - 1,
  );
  for (const q of run.points) {
    const truth = ballAt(q.t);
    expect(Math.hypot(q.x - truth.x, q.y - truth.y)).toBeLessThan(1.5);
  }
});
