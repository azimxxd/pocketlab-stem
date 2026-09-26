import type { Axis, MotionAnalysis, MotionIssue, MotionSample, Vec3 } from '../contracts';
import { median } from './sound';
export const norm = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
/** Angular velocity about the device axes, deg/s (alpha→z, beta→x, gamma→y). */
export const bodyRate = (s: MotionSample): Vec3 | null =>
  s.rotationRate
    ? { x: s.rotationRate.beta, y: s.rotationRate.gamma, z: s.rotationRate.alpha }
    : null;
const axes: Axis[] = ['x', 'y', 'z'];
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const angleDeg = (a: Vec3, b: Vec3) => {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (norm(a) * norm(b));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};
/** Timestamps must strictly increase; out-of-order or repeated events are dropped, not reordered. */
export function monotonic(samples: MotionSample[]) {
  const out: MotionSample[] = [];
  for (const s of samples) if (!out.length || s.t > out.at(-1)!.t) out.push(s);
  return out;
}
export const RULES = {
  /** Half-width of the stillness window, s. */
  window: 0.25,
  /** Max per-component SD of acceleration inside the window, m/s². */
  accelSd: 0.12,
  /** Max |ω| on any axis inside the window, deg/s. */
  rate: 4,
  /** Minimum duration of a still interval, s. */
  minStill: 0.8,
  minSamples: 50,
  minDuration: 2,
};
/** A window is quasi-static when every component barely changes and the phone does not rotate. */
export function quasiStatic(window: MotionSample[], gapS = 0.1) {
  if (window.length < 5 || window.some((w) => !w.accelerationWithGravity)) return false;
  if (window.at(-1)!.t - window[0].t < RULES.window) return false;
  for (let j = 1; j < window.length; j++) if (window[j].t - window[j - 1].t > gapS) return false;
  const a = window.map((w) => w.accelerationWithGravity!);
  if (axes.some((k) => sd(a.map((v) => v[k])) > RULES.accelSd)) return false;
  return window.every((w) => {
    const r = bodyRate(w);
    return !r || axes.every((k) => Math.abs(r[k]) <= RULES.rate);
  });
}
type Still = MotionAnalysis['still'][number] & { first: number; last: number };
function stillIntervals(samples: MotionSample[], gapS: number): Still[] {
  const flags = samples.map((s, i) => {
    if (!s.accelerationWithGravity) return false;
    const window: MotionSample[] = [];
    for (let j = i; j >= 0 && s.t - samples[j].t <= RULES.window; j--) window.unshift(samples[j]);
    for (let j = i + 1; j < samples.length && samples[j].t - s.t <= RULES.window; j++)
      window.push(samples[j]);
    return quasiStatic(window, gapS);
  });
  const out: Still[] = [];
  let start = -1;
  const close = (end: number) => {
    const part = samples.slice(start, end + 1);
    if (part.at(-1)!.t - part[0].t < RULES.minStill) return;
    const a = part.map((s) => s.accelerationWithGravity!);
    const magnitudes = a.map(norm);
    out.push({
      startS: part[0].t,
      endS: part.at(-1)!.t,
      meanMagnitude: mean(magnitudes),
      sdMagnitude: sd(magnitudes),
      gravity: {
        x: mean(a.map((v) => v.x)),
        y: mean(a.map((v) => v.y)),
        z: mean(a.map((v) => v.z)),
      },
      first: start,
      last: end,
    });
  };
  flags.forEach((still, i) => {
    const continues = still && start >= 0 && samples[i].t - samples[i - 1].t <= gapS;
    if (still && start < 0) start = i;
    else if (start >= 0 && !continues) {
      close(i - 1);
      start = still ? i : -1;
    }
  });
  if (start >= 0) close(samples.length - 1);
  return out;
}
/**
 * Accelerometer (with gravity) and gyroscope analysis. Gravity projections are interpreted only in
 * still intervals. Tilt between still intervals uses the angle between mean gravity vectors, so it
 * does not depend on the platform's sign convention; rotation about the vertical is invisible to
 * it by design. Gyroscope angles are trapezoidal integrals over real timestamps and drift.
 */
export function analyzeMotion(
  raw: MotionSample[],
  options: { interrupted?: boolean; simulation?: boolean } = {},
): MotionAnalysis {
  const samples = monotonic(raw);
  const n = samples.length;
  const durationS = n > 1 ? samples.at(-1)!.t - samples[0].t : 0;
  const intervals = samples.slice(1).map((s, i) => s.t - samples[i].t);
  const medianInterval = median(intervals);
  const gapS = Math.max(0.1, (medianInterval ?? 0) * 5);
  const gapList = intervals.filter((dt) => dt > gapS);
  const accelerationSamples = samples.filter((s) => s.accelerationWithGravity).length;
  const rotationSamples = samples.filter((s) => s.rotationRate).length;
  const still = stillIntervals(samples, gapS);
  const restValues = still.flatMap((st) =>
    samples.slice(st.first, st.last + 1).map((s) => norm(s.accelerationWithGravity!)),
  );
  const movements = still.slice(1).map((after, i) => {
    const before = still[i];
    const span = samples.slice(before.last, after.first + 1);
    let spansGap = false;
    let gyro: Vec3 | null = rotationSamples ? { x: 0, y: 0, z: 0 } : null;
    for (let j = 1; j < span.length && gyro; j++) {
      const dt = span[j].t - span[j - 1].t;
      const [r0, r1] = [bodyRate(span[j - 1]), bodyRate(span[j])];
      if (dt > gapS || !r0 || !r1) {
        spansGap = true;
        continue;
      }
      for (const k of axes) gyro[k] += ((r0[k] + r1[k]) / 2) * dt;
    }
    const peaks = axes.map((k) => Math.max(0, ...span.map((s) => Math.abs(bodyRate(s)?.[k] ?? 0))));
    const top = Math.max(...peaks);
    return {
      startS: before.endS,
      endS: after.startS,
      tiltDeg: angleDeg(before.gravity, after.gravity),
      gyroDeg: gyro,
      dominantAxis: gyro && top > RULES.rate ? axes[peaks.indexOf(top)] : null,
      spansGap,
    };
  });
  const peakRate = Object.fromEntries(
    axes.map((k) => {
      const values = samples.map((s) => bodyRate(s)?.[k]).filter((v): v is number => v != null);
      return [
        k,
        values.length ? values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null,
      ];
    }),
  ) as MotionAnalysis['peakRate'];
  const reasons: MotionIssue[] = [];
  if (n < RULES.minSamples || durationS < RULES.minDuration) reasons.push('TOO_FEW_SAMPLES');
  if (gapList.length) reasons.push('TIME_GAP');
  if (accelerationSamples < n) reasons.push('NULL_SENSOR');
  if (n && !rotationSamples) reasons.push('NO_ROTATION_SENSOR');
  if (!still.length) reasons.push('NO_STILL_SEGMENT');
  if (options.interrupted) reasons.push('INTERRUPTED');
  if (options.simulation) reasons.push('DEMO_DATA');
  const invalid = reasons.includes('TOO_FEW_SAMPLES') || accelerationSamples === 0;
  return {
    algorithmVersion: 'motion-v1',
    sampleCount: n,
    durationS,
    rateHz: durationS > 0 ? (n - 1) / durationS : null,
    medianIntervalS: medianInterval && medianInterval > 0 ? medianInterval : null,
    gaps: { count: gapList.length, longestS: Math.max(0, ...gapList) },
    accelerationSamples,
    rotationSamples,
    still: still.slice(0, 50).map(({ first: _f, last: _l, ...rest }) => rest),
    restMagnitude: restValues.length
      ? { mean: mean(restValues), sd: sd(restValues), samples: restValues.length }
      : null,
    movements: movements.slice(0, 50),
    peakRate,
    quality: { status: invalid ? 'invalid' : reasons.length ? 'warning' : 'valid', reasons },
  };
}
/**
 * Explicit synthetic recording, 100 Hz: flat 2 s → tilt 90° about x → on edge 2 s → spin 180°
 * about the vertical (now device y) → still 2 s. Gravity 9.81 m/s² is a generator parameter here,
 * never a value imposed on measurements.
 */
export function createMotionDemo(): MotionSample[] {
  const g = 9.81,
    dt = 0.01,
    move = 1.5;
  const bump = (t: number, t0: number, total: number) =>
    t < t0 || t > t0 + move
      ? 0
      : ((total * Math.PI) / (2 * move)) * Math.sin((Math.PI * (t - t0)) / move);
  const tiltAt = (t: number) =>
    t < 2 ? 0 : t > 2 + move ? 90 : (90 / 2) * (1 - Math.cos((Math.PI * (t - 2)) / move));
  const noise = (i: number, k: number) => 0.02 * Math.sin(i * (1.7 + k) + k * 2.3);
  return Array.from({ length: Math.round(9 / dt) + 1 }, (_, i) => {
    const t = i * dt;
    const theta = (tiltAt(t) * Math.PI) / 180;
    return {
      t,
      accelerationWithGravity: {
        x: noise(i, 0),
        y: g * Math.sin(theta) + noise(i, 1),
        z: g * Math.cos(theta) + noise(i, 2),
      },
      rotationRate: {
        alpha: 5 * noise(i, 3),
        beta: bump(t, 2, 90) + 5 * noise(i, 4),
        gamma: bump(t, 5.5, 180) + 5 * noise(i, 5),
      },
    };
  });
}
