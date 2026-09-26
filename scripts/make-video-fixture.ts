/**
 * Builds tests/fixtures/video/throw-vfr.mp4: a synthetic ball thrown upward and falling, with a
 * ruler, encoded as VP9 in MP4 with deliberately variable frame intervals (30/37 ms).
 * Run: PLAYWRIGHT_CHANNEL=chrome node scripts/make-video-fixture.ts
 * The motion is generated (not filmed): a = 3924 px/s², ruler 200 px = 0.5 m ⇒ g = 9.81 m/s².
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { writeMp4 } from '../tests/fixtures/mp4-writer.ts';
import { FIXTURE } from '../tests/fixtures/video-fixture.ts';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage();
// WebCodecs needs a secure context: serve an empty page on a routed https origin.
await page.route('https://fixture.invalid/', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fixture</title>' }),
);
await page.goto('https://fixture.invalid/');
const chunks = await page.evaluate(async (f) => {
  const canvas = new OffscreenCanvas(f.width, f.height);
  const ctx = canvas.getContext('2d')!;
  const out: { data: number[]; timestamp: number; key: boolean }[] = [];
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      out.push({ data: [...data], timestamp: chunk.timestamp, key: chunk.type === 'key' });
    },
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({ codec: 'vp09.00.10.08', width: f.width, height: f.height, bitrate: 400_000 });
  f.times.forEach((t: number, i: number) => {
    ctx.fillStyle = '#10201e';
    ctx.fillRect(0, 0, f.width, f.height);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(f.ruler.x - 3, f.ruler.y1, 6, f.ruler.y2 - f.ruler.y1);
    ctx.fillRect(f.ruler.x - 10, f.ruler.y1 - 1, 20, 2);
    ctx.fillRect(f.ruler.x - 10, f.ruler.y2 - 1, 20, 2);
    const x = f.x0 + f.vx * t,
      y = f.y0 + f.vy * t + 0.5 * f.a * t * t;
    if (y < f.height + 20) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
    }
    const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) });
    encoder.encode(frame, { keyFrame: i === 0 });
    frame.close();
  });
  await encoder.flush();
  return out;
}, FIXTURE);
await browser.close();
const ticks = FIXTURE.times.map((t) => Math.round(t * 90000));
const bytes = writeMp4({
  width: FIXTURE.width,
  height: FIXTURE.height,
  timescale: 90000,
  samples: chunks.map((c, i) => ({
    data: Uint8Array.from(c.data),
    dts: ticks[i],
    duration: (ticks[i + 1] ?? ticks[i] + 3000) - ticks[i],
    sync: c.key,
  })),
});
mkdirSync('tests/fixtures/video', { recursive: true });
writeFileSync('tests/fixtures/video/throw-vfr.mp4', bytes);
console.log(`wrote ${bytes.length} bytes, ${chunks.length} frames`);
