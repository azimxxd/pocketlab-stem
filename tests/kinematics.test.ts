import { describe, it, expect } from 'vitest';
import {
  analyzeBounce,
  analyzeFlight,
  createFlightDemo,
  fitQuadratic,
} from '../packages/physics/kinematics';
import { videoInvestigationSchema, type TrackPoint } from '../packages/contracts';
const G = 9.81;
/** Synthetic track in display pixels (y down) from a known motion; s = metres per pixel. */
function track(
  times: number[],
  { s = 0.002, vx = 0.8, vy = 0.5, a = G, rollDeg = 0, timeFactor = 1, noise = 0 } = {},
): TrackPoint[] {
  const r = (rollDeg * Math.PI) / 180;
  return times.map((t, i) => {
    const real = t / timeFactor;
    const X = vx * real,
      Y = vy * real - 0.5 * a * real * real;
    // Camera roll rotates the world into the image.
    const xr = X * Math.cos(r) - Y * Math.sin(r),
      yr = X * Math.sin(r) + Y * Math.cos(r);
    return {
      frame: i,
      t,
      x: 200 + xr / s + noise * Math.sin(i * 2.7),
      y: 300 - yr / s + noise * Math.cos(i * 1.9),
      uncertain: false,
    };
  });
}
const base = {
  metersPerPx: 0.002,
  scaleRelBound: 0.01,
  timeFactor: 1,
  timebaseKnown: true,
  clickErrorPx: 2,
};
const at30 = Array.from({ length: 18 }, (_, i) => i / 30);
describe('V1 flight analysis', () => {
  it('recovers a known acceleration within 2% without noise (plan acceptance)', () => {
    const result = analyzeFlight(track(at30), base);
    expect(Math.abs(result.g! - G) / G).toBeLessThan(0.02);
    expect(result.quality.status).toBe('valid');
  });
  it('the fitted value follows the data, not a reference g', () => {
    expect(analyzeFlight(track(at30, { a: 1.62 }), base).g).toBeCloseTo(1.62, 6);
  });
  it('|a| does not depend on camera roll; roll appears as the direction of a', () => {
    const result = analyzeFlight(track(at30, { rollDeg: 12 }), base);
    expect(result.g).toBeCloseTo(G, 6);
    expect(Math.abs(result.acceleration!.tiltDeg)).toBeCloseTo(12, 4);
  });
  it('uses real frame times: variable intervals and dropped frames', () => {
    const vfr = [0, 0.031, 0.064, 0.097, 0.131, 0.2, 0.232, 0.268, 0.3, 0.335, 0.4];
    expect(analyzeFlight(track(vfr), base).g).toBeCloseTo(G, 6);
    // Assuming a nominal 30 fps instead of the real times gives a wrong value.
    const nominal = track(vfr).map((p, i) => ({ ...p, t: i / 30 }));
    expect(Math.abs(analyzeFlight(nominal, base).g! - G)).toBeGreaterThan(1);
  });
  it('slow motion needs the declared factor; unknown speed disables g', () => {
    const slow = track(
      at30.map((t) => t * 8),
      { timeFactor: 8 },
    );
    expect(analyzeFlight(slow, { ...base, timeFactor: 8 }).g).toBeCloseTo(G, 6);
    const unknown = analyzeFlight(slow, { ...base, timeFactor: null });
    expect(unknown.g).toBeNull();
    expect(unknown.quality.reasons).toContain('TIME_SCALE_UNKNOWN');
    expect(analyzeFlight(track(at30), { ...base, timebaseKnown: false }).g).toBeNull();
  });
  it('scale: result scales with the calibration, missing scale disables g', () => {
    expect(analyzeFlight(track(at30), { ...base, metersPerPx: 0.004 }).g).toBeCloseTo(2 * G, 6);
    const none = analyzeFlight(track(at30), { ...base, metersPerPx: null });
    expect(none.g).toBeNull();
    expect(none.quality.reasons).toContain('SCALE_MISSING');
    const loose = analyzeFlight(track(at30), { ...base, scaleRelBound: 0.08 });
    expect(loose.quality.reasons).toContain('SCALE_UNCERTAIN');
    expect(loose.acceleration!.scaleBound).toBeCloseTo(0.08 * G, 6);
  });
  it('reports statistical spread from click noise separately from the scale bound', () => {
    const noisy = analyzeFlight(track(at30, { noise: 1.5 }), base);
    expect(noisy.acceleration!.statSe).toBeGreaterThan(0);
    expect(Math.abs(noisy.g! - G)).toBeLessThan(4 * noisy.acceleration!.statSe!);
  });
  it('a bounce inside the interval breaks the parabola model', () => {
    const points = track(at30);
    const bounced = points.map((p, i) => (i > 9 ? { ...p, y: 2 * points[9].y - p.y } : p));
    const result = analyzeFlight(bounced, base);
    expect(result.quality.reasons).toContain('MODEL_ASSUMPTION');
    expect(result.g).toBeNull();
  });
  it('too few points or too short an interval', () => {
    expect(analyzeFlight(track(at30.slice(0, 4)), base).quality.reasons).toContain(
      'TOO_FEW_POINTS',
    );
    const at60 = Array.from({ length: 8 }, (_, i) => i / 60);
    expect(analyzeFlight(track(at60), base).quality.reasons).toContain('SHORT_INTERVAL');
  });
  it('demo track is labelled', () => {
    const demo = analyzeFlight(createFlightDemo(), { ...base, simulation: true });
    expect(demo.quality.reasons).toContain('DEMO_DATA');
    expect(Math.abs(demo.g! - G) / G).toBeLessThan(0.05);
  });
  it('quadratic fit is exact on a parabola', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4];
    const q = fitQuadratic(
      t,
      t.map((x) => 1 + 2 * x - 3 * x * x),
    )!;
    expect(2 * q.c2).toBeCloseTo(-6, 9);
    expect(q.rms).toBeCloseTo(0, 9);
  });
});
describe('V2 bounce analysis', () => {
  /** Drop from h1, bounce with restitution e; heights in px above the contact position. */
  function bounce(e: number, h1Px = 400, fps = 60) {
    const g = 3000; // px/s², arbitrary: the ratio must not depend on it
    const t1 = Math.sqrt((2 * h1Px) / g);
    const v2 = e * g * t1;
    const out: TrackPoint[] = [];
    for (let i = 0; i * (1 / fps) < t1 + (2 * v2) / g; i++) {
      const t = i / fps;
      const h = t <= t1 ? h1Px - 0.5 * g * t * t : v2 * (t - t1) - 0.5 * g * (t - t1) ** 2;
      out.push({ frame: i, t, x: 100, y: 500 - Math.max(0, h), uncertain: false });
    }
    const contactIndex = Math.round(t1 * fps);
    out[contactIndex] = { ...out[contactIndex], t: t1, y: 500 };
    return { points: out, contactFrame: contactIndex };
  }
  it('recovers h2/h1 and e = √(h2/h1) independent of scale and time unit', () => {
    const { points, contactFrame } = bounce(0.7);
    const result = analyzeBounce(points, contactFrame, { timebaseKnown: true });
    expect(result.ratio).toBeCloseTo(0.49, 2);
    expect(result.restitution).toBeCloseTo(0.7, 2);
    const stretched = points.map((p) => ({ ...p, t: p.t * 3 }));
    expect(analyzeBounce(stretched, contactFrame, { timebaseKnown: true }).ratio).toBeCloseTo(
      0.49,
      2,
    );
  });
  it('needs the contact frame and enough points on each arc', () => {
    const { points } = bounce(0.7);
    expect(analyzeBounce(points, null, { timebaseKnown: true }).quality.reasons).toContain(
      'CONTACT_MISSING',
    );
    const { points: p2, contactFrame } = bounce(0.7);
    expect(
      analyzeBounce(p2.slice(contactFrame - 2), contactFrame, { timebaseKnown: true }).quality
        .reasons,
    ).toContain('TOO_FEW_POINTS');
  });
  it('a rebound higher than the drop violates the model', () => {
    const { points, contactFrame } = bounce(1.2);
    const result = analyzeBounce(points, contactFrame, { timebaseKnown: true });
    expect(result.quality.reasons).toContain('MODEL_ASSUMPTION');
    expect(result.restitution).toBeNull();
  });
});
describe('video record contract', () => {
  it('imported records carry video metadata but never media; synthetic ones carry none', () => {
    const now = new Date().toISOString();
    const points = createFlightDemo();
    const doc = {
      schemaVersion: 2,
      scenarioId: 'video-01',
      scenarioVersion: 1,
      id: crypto.randomUUID(),
      createdAt: now,
      provenance: 'simulation',
      mode: 'flight',
      hypothesis: 'Растёт равномерно',
      hypothesisAt: now,
      conclusion: '',
      video: null,
      speed: 'realtime',
      timeFactor: 1,
      scale: { p1: { x: 0, y: 0 }, p2: { x: 500, y: 0 }, lengthM: 1, lengthErrorM: 0.002 },
      clickErrorPx: 2,
      points,
      contactFrame: null,
      flight: analyzeFlight(points, { ...base, simulation: true }),
      bounce: null,
    };
    expect(videoInvestigationSchema.safeParse(doc).success).toBe(true);
    expect(videoInvestigationSchema.safeParse({ ...doc, provenance: 'imported' }).success).toBe(
      false,
    );
  });
});
