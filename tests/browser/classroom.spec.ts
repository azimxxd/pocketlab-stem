import { test, expect, type Browser, type Page } from '@playwright/test';
// Teacher, two students and the shared screen in separate browser contexts (separate devices),
// against the local classroom API.
async function device(browser: Browser, path = '/#class') {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  return page;
}
async function joinAs(browser: Browser, code: string, name: string) {
  const page = await device(browser, `/#class/join/${code}`);
  await expect(page.getByLabel('Код комнаты')).toHaveValue(code);
  await page.getByLabel('Псевдоним').fill(name);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText(`КОМНАТА ${code} · ${name}`)).toBeVisible();
  return page;
}
async function sendTrial(page: Page, time: string) {
  await page.getByLabel('Общее время, с').fill(time);
  await expect(page.getByText('Будет отправлено')).toBeVisible();
  await page.getByRole('button', { name: 'Отправить учителю' }).click();
}
test('teacher → QR code → students submit → shared screen and teacher see the law', async ({
  browser,
}) => {
  const teacher = await device(browser);
  await teacher.getByLabel('Название (необязательно)').fill('9Б физика');
  await teacher.getByRole('button', { name: 'Создать занятие' }).click();
  await expect(teacher.getByText('ЗАНЯТИЕ · ПАНЕЛЬ УЧИТЕЛЯ')).toBeVisible();
  await expect(teacher.getByRole('img', { name: /QR-код для входа/ })).toBeVisible();
  const code = (await teacher.locator('.code-big').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  const screenHref = await teacher.getByRole('link', { name: 'Общий экран' }).getAttribute('href');
  expect(screenHref).toContain(`#class/screen/${code}/`);
  const screen = await device(browser, screenHref!.replace(/^https?:\/\/[^/]+/, ''));
  await expect(screen.getByText('9Б физика')).toBeVisible();
  const asel = await joinAs(browser, code, 'Асель');
  const timur = await joinAs(browser, code, 'Тимур');
  await expect(teacher.getByRole('heading', { name: 'Участники (2)' })).toBeVisible();
  await expect(asel.getByText('Учитель ещё не начал сбор.')).toBeVisible();
  await teacher.getByRole('button', { name: /Распределить длины/ }).click();
  await expect(asel.getByRole('heading', { name: /при длине нити 0,2 м/ })).toBeVisible();
  await expect(timur.getByRole('heading', { name: /при длине нити 0,35 м/ })).toBeVisible();
  await teacher.getByRole('button', { name: 'Начать сбор' }).click();
  await expect(asel.getByLabel('Длина нити L, м')).toHaveValue('0,2');
  await sendTrial(asel, '8,98');
  await sendTrial(timur, '11,87');
  await expect(asel.locator('.class-list')).toContainText('отправлено');
  await expect(screen.getByText('Участников 2 · точек 2')).toBeVisible();
  await expect(teacher.getByRole('heading', { name: 'Присланные результаты (2)' })).toBeVisible();
  await expect(timur.locator('.discovery .pill')).toContainText('2 из 5 длин');
  // A wrong length is refused by the student's form before sending.
  await asel.getByLabel('Длина нити L, м').fill('0,75');
  await asel.getByLabel('Общее время, с').fill('17,4');
  await expect(asel.getByText('Длина отличается от задания учителя.')).toBeVisible();
  await expect(asel.getByRole('button', { name: 'Отправить учителю' })).toBeDisabled();
  // Hiding a point removes it from everyone else's board.
  await teacher.getByRole('button', { name: 'Скрыть' }).first().click();
  await expect(screen.getByText(/Участников 2 · точек 1/)).toBeVisible();
  await teacher.getByRole('button', { name: 'Обсуждение' }).click();
  await expect(timur.getByText('Сбор результатов завершён.')).toBeVisible();
  const download = teacher.waitForEvent('download');
  await teacher.getByRole('button', { name: 'Экспорт JSON' }).click();
  const stream = await (await download).createReadStream();
  let json = '';
  for await (const chunk of stream!) json += chunk;
  const exported = JSON.parse(json);
  expect(exported.submissions).toHaveLength(2);
  expect(json).not.toMatch(/ownerToken|participantToken|viewerToken/);
});
test('closing entry, removing a student and deleting the room', async ({ browser }) => {
  const teacher = await device(browser);
  await teacher.getByRole('button', { name: 'Создать занятие' }).click();
  const code = (await teacher.locator('.code-big').textContent())!.trim();
  const dana = await joinAs(browser, code, 'Дана');
  await teacher.getByRole('button', { name: 'Закрыть вход' }).click();
  const late = await device(browser, `/#class/join/${code}`);
  await late.getByLabel('Псевдоним').fill('Опоздавший');
  await late.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(late.getByRole('alert')).toContainText('закрыл вход');
  teacher.once('dialog', (d) => void d.accept());
  await teacher.getByRole('button', { name: 'Убрать' }).click();
  await expect(dana.getByRole('alert')).toContainText('убрал тебя из комнаты');
  teacher.once('dialog', (d) => void d.accept());
  await teacher.getByRole('button', { name: 'Удалить занятие' }).click();
  await expect(teacher.getByRole('heading', { name: 'Класс', exact: true })).toBeVisible();
  const again = await device(browser, `/#class/join/${code}`);
  await again.getByLabel('Псевдоним').fill('Кто-то');
  await again.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(again.getByRole('alert')).toContainText('не найдена');
});
test('a submission made offline is queued and delivered once the network returns', async ({
  browser,
}) => {
  const teacher = await device(browser);
  await teacher.getByRole('button', { name: 'Создать занятие' }).click();
  const code = (await teacher.locator('.code-big').textContent())!.trim();
  await teacher.getByRole('button', { name: 'Начать сбор' }).click();
  const student = await joinAs(browser, code, 'Ерлан');
  await expect(student.getByLabel('Общее время, с')).toBeEnabled();
  await student.getByLabel('Длина нити L, м').fill('0,5');
  await student.context().setOffline(true);
  await sendTrial(student, '14,2');
  await expect(student.locator('.class-list')).toContainText('в очереди');
  await expect(teacher.getByRole('heading', { name: 'Присланные результаты (0)' })).toBeVisible();
  await student.context().setOffline(false);
  await expect(student.locator('.class-list')).toContainText('отправлено', { timeout: 15000 });
  await expect(teacher.getByRole('heading', { name: 'Присланные результаты (1)' })).toBeVisible();
});
test('class pages fit a 360 px phone', async ({ browser }) => {
  const teacher = await device(browser);
  await teacher.getByRole('button', { name: 'Создать занятие' }).click();
  const code = (await teacher.locator('.code-big').textContent())!.trim();
  const student = await joinAs(browser, code, 'Малика');
  await student.setViewportSize({ width: 360, height: 800 });
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
