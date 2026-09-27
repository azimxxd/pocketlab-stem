// Synthetic events exist ONLY in this test. The application has no simulation mode.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "msedge",
  headless: true,
});
const errors: string[] = [];
try {
  await mkdir("test-results", { recursive: true });
  const laptop = await browser.newPage({
    viewport: { width: 1280, height: 1100 },
  });
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  for (const page of [laptop, phone])
    page.on("pageerror", (e) => errors.push(e.message));
  async function pairPhone(page: typeof phone) {
    const host = await browser.newPage();
    host.on("pageerror", (e) => errors.push(e.message));
    await host.goto(process.env.TEST_URL || "http://localhost:3000");
    await host.locator("#create").click();
    await expect(host.locator("#session")).toHaveText(/^[A-Z2-9]{6}$/);
    const sessionCode = (await host.locator("#session").textContent())!;
    await page.goto(`${process.env.TEST_URL || "http://localhost:3000"}/phone?session=${sessionCode}`);
    await expect(page.locator("#sensor-panel")).toBeVisible();
    return host;
  }
  await laptop.goto(process.env.TEST_URL || "http://localhost:3000");
  await expect(laptop.locator("#stage-locked")).toBeVisible();
  const reference = laptop.locator("#reference");
  await expect(reference).toBeVisible();
  await expect(reference).not.toHaveAttribute("open", "");
  await reference.locator("summary").click();
  await expect(reference).toHaveAttribute("open", "");
  await expect(reference).toContainText("9,81 м/с²");
  await expect(reference).toContainText("до центра масс телефона");
  await expect(reference).toContainText("T1, T2, T3");
  await expect(reference.locator("details")).toHaveCount(0);
  await reference.locator("summary").click();
  await expect(reference).not.toHaveAttribute("open", "");
  await expect(laptop.locator(".graph-card")).toBeHidden();
  await expect(laptop.locator(".results-card")).toBeHidden();
  const navigation = laptop.locator(".main-navigation a");
  await expect(navigation).toHaveCount(4);
  await expect(navigation).toHaveText(["Маятник", "Увидь свой голос", "Собери музыкальный инструмент", "Кнопка 5"]);
  await expect(navigation.nth(0)).toHaveAttribute("aria-current", "page");
  await expect(navigation.nth(0)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(laptop.locator("#sensor-data")).toHaveAttribute("aria-disabled", "true");
  await laptop.locator("#sensor-data-summary").click();
  await expect(laptop.locator("#sensor-data")).not.toHaveAttribute("open", "");
  await laptop.locator("#create").click();
  await expect(laptop.locator("#session")).toHaveText(/^[A-Z2-9]{6}$/);
  const connectionLayout = await laptop.evaluate<{ phone: { right: number }; workspace: { left: number }; pair: { right: number } }>(`(() => {
    const rect = selector => {
      const { left, right, width } = document.querySelector(selector).getBoundingClientRect();
      return { left, right, width };
    };
    return { phone: rect(".phone-card"), workspace: rect(".main-workspace"), pair: rect("#pair") };
  })()`);
  assert.ok(connectionLayout.phone.right <= connectionLayout.workspace.left + 1, "phone card must not overlap the measurement workspace");
  assert.ok(connectionLayout.pair.right <= connectionLayout.phone.right + 1, "QR code must stay inside the phone card");
  await expect(laptop.locator("#pair details, #base-url, #pair-update")).toHaveCount(0);
  await phone.addInitScript(`Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>Promise.reject(new Error('camera denied'))}})`);
  await phone.goto(new URL("/phone", laptop.url()).href);
  await expect(phone.locator(".phone-header")).toContainText("PocketLab");
  for (const width of [320, 360, 390, 430]) {
    await phone.setViewportSize({ width, height: 780 });
    const layout = await phone.evaluate(() => {
      const panel = document.querySelector(".phone-panel")!.getBoundingClientRect();
      return { screen: window.innerWidth, document: document.documentElement.scrollWidth, left: panel.left, right: panel.right };
    });
    assert.ok(layout.document <= layout.screen, `phone page must not overflow at ${width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.left >= 0 && layout.right <= layout.screen, `phone panel must fit the ${width}px screen`);
  }
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.locator("#scan-start").click();
  await expect(phone.locator("#pairing-error")).toContainText("Введите код вручную");
  await phone.locator("#code").fill((await laptop.locator("#session").textContent())!);
  await phone.locator("#join").click();
  await expect(phone.locator("#sensor-panel")).toBeVisible();
  await phone.locator("#permissions").click();
  await expect(laptop.locator("#connection")).toHaveText("Телефон подключён");
  await expect(laptop.locator("#calibration-panel")).toBeVisible();
  await expect(laptop.locator("#sensor-data")).toHaveAttribute("aria-disabled", "false");
  await expect(laptop.locator(".advanced")).not.toHaveAttribute("open", "");
  await expect(laptop.locator("#diagnostics")).toBeHidden();
  await phone.evaluate(() => {
    (window as any).testMoving = false;
    (window as any).testPaused = false;
    (window as any).testTimer = setInterval(() => {
      if ((window as any).testPaused) return;
      const moving = (window as any).testMoving;
      window.dispatchEvent(
        new DeviceMotionEvent("devicemotion", {
          acceleration: { x: moving ? 1 : 0, y: 0, z: 0 },
          accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
          rotationRate: {
            alpha: moving
              ? 12 * Math.cos((Date.now() / 1000) * ((2 * Math.PI) / 0.5))
              : 0.1,
            beta: 0,
            gamma: 0,
          },
        }),
      );
      window.dispatchEvent(
        new DeviceOrientationEvent("deviceorientation", {
          alpha: moving ? (Date.now() / 20) % 360 : 0,
          beta: 90,
          gamma: 0,
          absolute: false,
        }),
      );
    }, 20);
  });
  await expect(laptop.locator("#start")).toBeEnabled();
  await laptop.locator("#start").click();
  await expect(laptop.locator("#state")).toHaveText("READY", {
    timeout: 10000,
  });
  await expect(laptop.locator(".graph-card")).toBeHidden();
  await expect(laptop.locator(".results-card")).toBeHidden();
  await laptop.locator("#continue-calibration").click();
  await expect(laptop.locator("#setup-panel")).toBeVisible();
  await laptop.locator("#length-cm").fill("50");
  await laptop.locator(".optional-length summary").click();
  await laptop.locator("#length-sigma-cm").fill("0.5");
  await laptop.locator("#begin-measurement").click();
  await expect(laptop.locator("#state")).toHaveText("WAITING_FOR_MOTION");
  await expect(laptop.locator("#awaiting-panel")).toBeVisible();
  await phone.evaluate(() => ((window as any).testMoving = true));
  await expect(laptop.locator("#state")).toHaveText("MEASURING");
  await expect(laptop.locator("#orientation-status")).toHaveText(
    "Ориентация обновляется",
  );
  await expect(laptop.locator("#visualizer canvas")).toBeVisible();
  await expect(laptop.locator("#pendulum-count")).toHaveText(
    /^(?:[5-9]|[1-9][0-9]+)$/,
    { timeout: 10000 },
  );
  await expect(laptop.locator("#pendulum-period")).toHaveText("0.50 с", {
    timeout: 5000,
  });
  await expect(laptop.locator("#gravity-value")).toContainText(
    "Предварительно:",
  );
  await expect(laptop.locator("#gravity-calculation")).toContainText("0.500");
  await expect(laptop.locator("#gravity-uncertainty")).toContainText("σg");
  await phone.evaluate(() => ((window as any).testPaused = true));
  await laptop.waitForTimeout(4000);
  await expect(laptop.locator("#state")).toHaveText("MEASURING");
  await phone.evaluate(() => ((window as any).testPaused = false));
  await laptop.waitForTimeout(200);
  await laptop.locator("#stop").click();
  await expect(laptop.locator("#state")).toHaveText("STOPPED");
  await expect(laptop.locator("#save-trial")).toBeVisible();
  await expect(laptop.locator("#gravity-value")).toContainText("Итог:");
  await laptop.locator("#save-trial").click();
  await expect(laptop.locator(".results-card")).toBeVisible();
  await expect(laptop.locator("#experiment-panel")).toBeVisible();
  await expect(laptop.locator("#experiment-conditions tr")).toHaveCount(1);
  await expect(laptop.locator("#graph-t-l")).toBeVisible();
  await expect(laptop.locator("#graph-t2-l")).toBeVisible();
  const plottedBluePixels = await laptop.locator("#graph-t-l").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 90 && pixels[i + 2] > 170 && pixels[i + 3] > 200) count++;
    return count;
  });
  assert.ok(plottedBluePixels > 0, "saved measurement should render a blue plot point");
  const downloadPromise = laptop.waitForEvent("download");
  await laptop.locator("#download").click();
  const download = await downloadPromise;
  await download.saveAs("test-results/recording.json");
  const data = JSON.parse(
    await readFile("test-results/recording.json", "utf8"),
  );
  const saved = data.trials[0];
  assert.ok(saved.recording.sampleCount > 100);
  assert.ok(saved.recording.endedAt);
  assert.ok(saved.recording.observedSampleRate > 0);
  assert.ok(saved.recording.calibration.stable);
  assert.equal(
    saved.recording.samples.find((s: any) => s.source === "motion").rotationRate
      .gamma,
    0,
  );
  assert.equal(saved.pendulum.algorithmVersion, "pca-zero-crossing-1.0.0");
  assert.ok(Math.abs(saved.pendulum.result.periodSec - 0.5) < 0.04);
  assert.ok(saved.pendulum.crossings.length > 10);
  assert.ok(saved.pendulum.individualPeriods.length >= 5);
  assert.ok(saved.pendulum.processedSignal.length > 100);
  assert.equal(saved.lengthMeters, 0.5);
  assert.ok(saved.periodSeconds > 0);
  assert.ok(saved.recording.samples.length > 100);
  assert.equal(data.analysis.fit, null);
  assert.deepEqual(data.analysis.conditions[0].trialIds, [saved.id]);
  assert.equal("recording" in data.analysis.conditions[0], false);
  assert.equal(saved.recording.sampleCount, saved.recording.samples.length);
  const csvPromise = laptop.waitForEvent("download");
  await laptop.locator("#download-csv").click();
  const csvDownload = await csvPromise;
  await csvDownload.saveAs("test-results/experiment.csv");
  const csv = await readFile("test-results/experiment.csv", "utf8");
  assert.match(
    csv,
    /trial_id,length_m,length_uncertainty_m,period_s,period_squared_s2/,
  );
  assert.match(csv, /"trial-1",0\.5,/);
  const tableHeightBeforeExpand = await laptop.locator("#experiment-table").evaluate((node) => node.getBoundingClientRect().height);
  await laptop.locator(".repeat-details summary").click();
  await expect(laptop.locator(".repeat-details ul")).toBeVisible();
  const tableHeightAfterExpand = await laptop.locator("#experiment-table").evaluate((node) => node.getBoundingClientRect().height);
  assert.ok(tableHeightAfterExpand <= tableHeightBeforeExpand + 1, "expanded repeats should overlay the table without stretching its rows");
  await laptop.locator('button[data-trial-action="exclude"]').click();
  await expect(laptop.locator("#experiment-progress")).toContainText("0 / 4");
  await laptop.locator(".repeat-details summary").click();
  await expect(
    laptop.locator('button[data-trial-action="restore"]'),
  ).toBeVisible();
  await laptop.locator('button[data-trial-action="restore"]').click();
  await expect(laptop.locator("#experiment-progress")).toContainText("1 / 4");
  await laptop.screenshot({ path: "test-results/laptop.png", fullPage: true });
  await phone.screenshot({ path: "test-results/phone.png", fullPage: true });
  const denied = await browser.newPage();
  denied.on("pageerror", (e) => errors.push(e.message));
  // Raw script avoids tsx injecting a __name helper into serialized permission mock functions.
  await denied.addInitScript({
    content:
      "Object.defineProperty(DeviceMotionEvent,'requestPermission',{value:()=>Promise.resolve('denied')});Object.defineProperty(DeviceOrientationEvent,'requestPermission',{value:()=>Promise.resolve('denied')});",
  });
  await pairPhone(denied);
  await denied.locator("#permissions").click();
  await expect(denied.locator("#permissions-status")).toContainText("запрещён");
  const unavailable = await browser.newPage();
  unavailable.on("pageerror", (e) => errors.push(e.message));
  await unavailable.addInitScript({
    content:
      "Object.defineProperty(window,'DeviceMotionEvent',{value:undefined});Object.defineProperty(window,'DeviceOrientationEvent',{value:undefined});",
  });
  await pairPhone(unavailable);
  await unavailable.locator("#permissions").click();
  await expect(unavailable.locator("#permissions-status")).toContainText(
    "не поддерживает",
  );
  const insecure = await browser.newPage();
  insecure.on("pageerror", (e) => errors.push(e.message));
  await insecure.addInitScript({
    content: "Object.defineProperty(window,'isSecureContext',{value:false});",
  });
  await pairPhone(insecure);
  await insecure.locator("#permissions").click();
  await expect(insecure.locator("#permissions-status")).toContainText(
    "Нужен HTTPS",
  );
  assert.deepEqual(errors, []);
  console.log(
    `Browser workflow passed: pairing → permissions → calibration → automatic start → graphs/3D → period detection → save trial → JSON/CSV → exclude/restore (${data.trials[0].recording.sampleCount} packets); denied, unsupported and insecure sensor cases.`,
  );
} finally {
  await browser.close();
}
