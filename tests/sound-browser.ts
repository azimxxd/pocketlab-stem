// Synthetic audio is confined to this test; production always requests the microphone.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"] });
const url = process.env.TEST_URL || "http://localhost:3000";
const errors: string[] = [];
try {
  await mkdir("test-results", { recursive: true });
  const laptop = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const page of [laptop, phone]) {
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(`(() => {
      const Original = window.WebSocket;
      window.testSockets = [];
      window.WebSocket = class extends Original {
        constructor(url, protocols) {
          super(url, protocols); window.testSockets.push(this);
        }
      };
    })()`);
  }
  await phone.addInitScript(`(() => {
    window.testDenied = true;
    window.testUnavailable = false;
    Object.defineProperty(navigator, "mediaDevices", { value: {
      getUserMedia: async () => {
        if (window.testUnavailable) throw new DOMException("No microphone", "NotFoundError");
        if (window.testDenied) throw new DOMException("Denied", "NotAllowedError");
        const context = new AudioContext({ sampleRate: 44100 }); await context.resume();
        const oscillator = context.createOscillator(), gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 220; gain.gain.value = 0;
        oscillator.connect(gain).connect(destination); oscillator.start();
        window.testAudio = { context, oscillator, gain, stream: destination.stream };
        return destination.stream;
      },
    } });
  })()`);
  await laptop.goto(`${url}/sound`);
  await expect(laptop.locator("#connection")).toHaveText("Сессия ещё не создана");
  await laptop.locator("#create").click();
  await expect(laptop.locator("#session")).toHaveText(/^[A-Z2-9]{6}$/);
  const code = (await laptop.locator("#session").textContent())!;
  const qr = await laptop.locator("#qr").evaluate((node: HTMLCanvasElement) => ({
    width: node.width, height: node.height,
    pixels: Array.from(node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data),
  }));
  const decoded = jsQR(Uint8ClampedArray.from(qr.pixels), qr.width, qr.height);
  assert.equal(decoded?.data, `${url}/phone?session=${code}`);
  await phone.goto(decoded!.data);
  await expect(phone.locator("#sensor-panel h1")).toHaveText("Увидь свой голос");
  await expect(phone.locator("#connection-status")).toHaveText("Телефон подключён");
  await expect(laptop.locator("#connection")).toHaveText("Телефон подключён");
  await phone.locator("#permissions").click();
  await expect(phone.locator("#permissions-status")).toContainText("запрещён");
  await expect(laptop.locator("#sound-start")).toBeDisabled();
  await phone.evaluate(() => (window as any).testDenied = false);
  await phone.evaluate(() => (window as any).testUnavailable = true);
  await phone.locator("#permissions").click();
  await expect(phone.locator("#permissions-status")).toHaveText("Микрофон не найден.");
  await phone.evaluate(() => (window as any).testUnavailable = false);
  await phone.locator("#permissions").click();
  await expect(phone.locator("#permissions-status")).toHaveText("Микрофон готов");
  await expect(laptop.locator("#sound-start")).toBeEnabled();
  await laptop.locator("#sound-start").click();
  await expect(laptop.locator("#measurement-state")).toContainText("Сохраняйте тишину");
  await expect(laptop.locator("#measurement-state")).toContainText("Издайте звук", { timeout: 10000 });
  await expect(phone.locator("#instructions")).toHaveText("Идёт измерение...");
  await phone.evaluate(() => (window as any).testAudio.gain.gain.value = 0.2);
  await expect(laptop.locator("#pitch")).toHaveText("220 Гц", { timeout: 10000 });
  await phone.evaluate(() => (window as any).testAudio.oscillator.frequency.value = 440);
  await expect(laptop.locator("#pitch")).toHaveText("440 Гц");
  for (const mode of ["spectrum", "wave", "history"]) {
    await laptop.locator(`[data-view="${mode}"]`).click();
    await expect(laptop.locator(`[data-view="${mode}"]`)).toHaveAttribute("aria-pressed", "true");
  }
  await laptop.screenshot({ path: "test-results/sound-laptop.png", fullPage: true });
  await phone.screenshot({ path: "test-results/sound-phone.png", fullPage: true });
  await laptop.locator("#sound-stop").click();
  await expect(laptop.locator("#sound-summary")).toContainText("Диапазон");
  await expect.poll(() => phone.evaluate(() => (window as any).testAudio.stream.getTracks()[0].readyState)).toBe("ended");
  await expect(laptop.locator("#sound-save")).toBeEnabled();
  await expect(laptop.locator("#sound-start")).toBeDisabled();
  const frozen = await laptop.locator("#sound-graph").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await phone.evaluate(() => (window as any).testAudio.oscillator.frequency.value = 880);
  await expect(laptop.locator("#pitch")).toHaveText("440 Гц");
  assert.equal(await laptop.locator("#sound-graph").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()), frozen);
  const download = laptop.waitForEvent("download"); await laptop.locator("#sound-save").click();
  assert.match((await download).suggestedFilename(), /pocketlab-sound/);
  // Automatic reconnect uses the same phone page and preserves experiment mode.
  await phone.evaluate(() => (window as any).testSockets.at(-1).close());
  await expect(phone.locator("#connection-status")).toHaveText("Телефон подключён");
  await expect(phone.locator("#sensor-panel h1")).toHaveText("Увидь свой голос");
  await phone.locator("#permissions").click();
  await expect(laptop.locator("#sound-start")).toBeEnabled();
  await laptop.evaluate(() => (window as any).testSockets.at(-1).close());
  await expect.poll(() => phone.evaluate(() => (window as any).testAudio.stream.getTracks()[0].readyState)).toBe("ended");
  await expect(laptop.locator("#connection")).toHaveText("Телефон подключён");
  await expect(laptop.locator("#session")).toHaveText(code);
  await expect(phone.locator("#permissions")).toHaveText("Разрешить микрофон");
  // Disconnect while measuring: stop acquisition and require a fresh measurement.
  await phone.locator("#permissions").click();
  await expect(laptop.locator("#sound-start")).toBeEnabled();
  await laptop.locator("#sound-start").click();
  await expect(laptop.locator("#measurement-state")).toContainText("Издайте звук");
  await phone.evaluate(() => (window as any).testAudio.gain.gain.value = 0.2);
  await expect(laptop.locator("#pitch")).toHaveText("220 Гц");
  await phone.evaluate(() => (window as any).testSockets.at(-1).close());
  await expect.poll(() => phone.evaluate(() => (window as any).testAudio.stream.getTracks()[0].readyState)).toBe("ended");
  await expect(laptop.locator("#sound-stop")).toBeHidden();
  await expect(laptop.locator("#connection")).toHaveText("Телефон подключён");
  await expect(laptop.locator("#sound-start")).toBeDisabled();
  for (const width of [390, 768, 1280]) {
    await laptop.setViewportSize({ width, height: 900 });
    assert.ok(await laptop.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  console.log("Sound browser passed: shared QR join, permission denial/retry, calibration, 220/440 Hz, views, frozen result, save, microphone release, phone/laptop reconnect and responsive layout.");
} finally { await browser.close(); }
