import { describe, it, expect } from 'vitest';
import { parseMoov, readMp4Timing } from '../packages/media/mp4-timing';
import { writeMp4, type WriterSample } from './fixtures/mp4-writer';
const frame = (dts: number, duration: number, cts?: number): WriterSample => ({
  data: new Uint8Array([1, 2, 3]),
  dts,
  duration,
  cts,
  sync: dts === 0,
});
async function timing(bytes: Uint8Array) {
  return (await readMp4Timing(bytes.length, async (a, b) => bytes.slice(a, b)))!;
}
describe('MP4 timing tables', () => {
  it('reads constant-rate frame times from stts', async () => {
    const samples = Array.from({ length: 30 }, (_, i) => frame(i * 3000, 3000));
    const t = await timing(writeMp4({ width: 64, height: 48, timescale: 90000, samples }));
    expect(t.codec).toBe('vp09');
    expect(t.frameTimes).toHaveLength(30);
    expect(t.frameTimes[1]).toBeCloseTo(1 / 30, 9);
    expect(t.endS).toBeCloseTo(1, 9);
    expect(t.issues).toEqual([]);
  });
  it('keeps variable frame intervals instead of a nominal fps', async () => {
    let dts = 0;
    const samples = Array.from({ length: 20 }, (_, i) => {
      const d = i % 2 ? 2700 : 3300;
      const s = frame(dts, d);
      dts += d;
      return s;
    });
    const t = await timing(writeMp4({ width: 64, height: 48, timescale: 90000, samples }));
    expect(t.frameTimes[1] - t.frameTimes[0]).toBeCloseTo(3300 / 90000, 9);
    expect(t.frameTimes[2] - t.frameTimes[1]).toBeCloseTo(2700 / 90000, 9);
  });
  it('orders B-frames by composition time and applies the edit-list start', async () => {
    // Decode order I P B B with a 2-frame reorder delay; edit list skips the delay.
    const d = 1000;
    const samples = [
      frame(0, d, 2 * d),
      frame(d, d, 5 * d),
      frame(2 * d, d, 3 * d),
      frame(3 * d, d, 4 * d),
    ];
    const t = await timing(
      writeMp4({
        width: 64,
        height: 48,
        timescale: 30000,
        movieTimescale: 1000,
        samples,
        edits: [{ durationMovie: Math.round((4 * d * 1000) / 30000), mediaTime: 2 * d }],
      }),
    );
    expect(t.frameTimes.map((x) => Math.round(x * 30000))).toEqual([0, d, 2 * d, 3 * d]);
  });
  it('an empty edit delays presentation', async () => {
    const samples = Array.from({ length: 5 }, (_, i) => frame(i * 100, 100));
    const t = await timing(
      writeMp4({
        width: 64,
        height: 48,
        timescale: 1000,
        movieTimescale: 1000,
        samples,
        edits: [
          { durationMovie: 250, mediaTime: -1 },
          { durationMovie: 500, mediaTime: 0 },
        ],
      }),
    );
    expect(t.frameTimes[0]).toBeCloseTo(0.25);
    expect(t.issues).toEqual([]);
  });
  it('flags edit lists that remap time (e.g. slow motion) as complex', async () => {
    const samples = Array.from({ length: 5 }, (_, i) => frame(i * 100, 100));
    const t = await timing(
      writeMp4({
        width: 64,
        height: 48,
        timescale: 1000,
        samples,
        edits: [
          { durationMovie: 200, mediaTime: 0 },
          { durationMovie: 1200, mediaTime: 200 },
        ],
      }),
    );
    expect(t.issues).toContain('COMPLEX_EDIT_LIST');
  });
  it('finds moov after mdat by reading headers only', async () => {
    const samples = Array.from({ length: 10 }, (_, i) => frame(i * 100, 100));
    const bytes = writeMp4({ width: 64, height: 48, timescale: 1000, samples, moovAtEnd: true });
    const reads: [number, number][] = [];
    const t = await readMp4Timing(bytes.length, async (a, b) => {
      reads.push([a, b]);
      return bytes.slice(a, b);
    });
    expect(t!.frameTimes).toHaveLength(10);
    expect(reads.every(([a, b]) => b - a <= 16 || bytes[a + 4] === 'm'.charCodeAt(0))).toBe(true);
  });
  it('reports missing or malformed timing instead of inventing frames', async () => {
    expect(await readMp4Timing(4, async () => new Uint8Array(4))).toBeNull();
    expect(parseMoov(new Uint8Array([0, 0, 0, 8, 109, 111, 111, 118])).issues).toContain(
      'MALFORMED',
    );
  });
});
