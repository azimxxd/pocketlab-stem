import type { Calibration } from "./core";
import type { SensorSample } from "./contracts";

export const PENDULUM_ALGORITHM_VERSION = "pca-zero-crossing-1.0.0";
export const PENDULUM_CONFIG = {
  minimumSamples: 24,
  minimumAmplitudeDegPerSec: 1,
  noiseHysteresisSigma: 4,
  peakHysteresisRatio: 0.07,
  minimumPeriodSec: 0.35,
  maximumPeriodSec: 8,
  periodDirection: "positive-to-negative" as const,
  maximumSampleGapMs: 500,
  minimumPeriodsForEstimate: 5,
  principalAxisRatio: 0.72,
  smoothAxisWeight: 0.2,
} as const;

export type Vec3 = [number, number, number];
export type Crossing = {
  timestamp: number;
  direction: "positive-to-negative" | "negative-to-positive";
  signalBefore: number;
  signalAfter: number;
};
export type PendulumPeriod = {
  startTimestamp: number;
  endTimestamp: number;
  seconds: number;
  direction: Crossing["direction"];
};
export type ProcessedPoint = { timestamp: number; value: number | null };
export type PendulumResult = {
  periodSec: number | null;
  frequencyHz: number | null;
  spreadSec: number | null;
  completePeriods: number;
  durationSec: number;
  sampleRateHz: number | null;
  dominantAxis: Vec3 | null;
  dominantRatio: number | null;
  peakDegPerSec: number | null;
  noiseDegPerSec: number | null;
  quality: string;
};
export type PendulumExport = {
  algorithmVersion: string;
  config: typeof PENDULUM_CONFIG;
  gyroBias: Vec3;
  calibrationNoise: Vec3;
  dominantAxis: Vec3 | null;
  processedSignal: ProcessedPoint[];
  crossings: Crossing[];
  individualPeriods: PendulumPeriod[];
  result: PendulumResult;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const normalize = (a: Vec3): Vec3 | null => {
  const n = norm(a);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : null;
};
const median = (items: number[]) => {
  if (!items.length) return null;
  const s = [...items].sort((a, b) => a - b),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Jacobi eigensolver for a symmetric 3×3 covariance matrix. */
function principal(cov: number[][]): { axis: Vec3; ratio: number } {
  const a = cov.map((row) => [...row]),
    v = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  for (let step = 0; step < 24; step++) {
    let p = 0,
      q = 1;
    if (Math.abs(a[0][2]) > Math.abs(a[p][q])) {
      p = 0;
      q = 2;
    }
    if (Math.abs(a[1][2]) > Math.abs(a[p][q])) {
      p = 1;
      q = 2;
    }
    if (Math.abs(a[p][q]) < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]),
      c = Math.cos(angle),
      s = Math.sin(angle);
    for (let k = 0; k < 3; k++)
      if (k !== p && k !== q) {
        const ap = a[k][p],
          aq = a[k][q];
        a[k][p] = a[p][k] = c * ap - s * aq;
        a[k][q] = a[q][k] = s * ap + c * aq;
      }
    const app = a[p][p],
      aqq = a[q][q],
      apq = a[p][q];
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      const vp = v[k][p],
        vq = v[k][q];
      v[k][p] = c * vp - s * vq;
      v[k][q] = s * vp + c * vq;
    }
  }
  const values = [a[0][0], a[1][1], a[2][2]],
    largest = values.indexOf(Math.max(...values));
  const axis = normalize([v[0][largest], v[1][largest], v[2][largest]]) ?? [
    1, 0, 0,
  ];
  return {
    axis,
    ratio:
      Math.max(0, values[largest]) /
      Math.max(
        1e-12,
        values.reduce((x, y) => x + Math.max(0, y), 0),
      ),
  };
}

export function gyroCalibration(calibration: Calibration): {
  bias: Vec3;
  noise: Vec3;
} {
  const bias = ["alpha", "beta", "gamma"].map(
    (k) => calibration.channels[`rotationRate.${k}`]?.mean ?? 0,
  ) as Vec3;
  const noise = ["alpha", "beta", "gamma"].map(
    (k) => calibration.channels[`rotationRate.${k}`]?.sd ?? 0,
  ) as Vec3;
  return { bias, noise };
}

/** Pure, deterministic analysis of the signed 3D gyroscope vector. */
export class PendulumAnalyzer {
  readonly bias: Vec3;
  readonly noise: Vec3;
  readonly processedSignal: ProcessedPoint[] = [];
  readonly crossings: Crossing[] = [];
  readonly periods: PendulumPeriod[] = [];
  private count = 0;
  private mean: Vec3 = [0, 0, 0];
  private scatter = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  private previousAxis: Vec3 | null = null;
  private axis: Vec3 | null = null;
  private ratio: number | null = null;
  private previous: { timestamp: number; signal: number } | null = null;
  private armed: "positive" | "negative" | null = null;
  private lastByDirection: {
    positive: number | null;
    negative: number | null;
  } = { positive: null, negative: null };
  private peak = 0;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private motionCount = 0;
  private finished = false;

  constructor(
    calibration: Calibration,
    readonly config = PENDULUM_CONFIG,
  ) {
    const c = gyroCalibration(calibration);
    this.bias = c.bias;
    this.noise = c.noise;
  }
  add(sample: SensorSample): void {
    if (this.finished || sample.source !== "motion") return;
    this.motionCount++;
    if (
      this.lastTimestamp !== null &&
      sample.timestamp - this.lastTimestamp > this.config.maximumSampleGapMs
    ) {
      this.previous = null;
      this.armed = null;
      this.lastByDirection = { positive: null, negative: null };
    }
    this.firstTimestamp ??= sample.timestamp;
    this.lastTimestamp = sample.timestamp;
    const raw = sample.rotationRate;
    if (raw.alpha === null || raw.beta === null || raw.gamma === null) {
      this.processedSignal.push({ timestamp: sample.timestamp, value: null });
      this.previous = null;
      this.armed = null;
      this.lastByDirection = { positive: null, negative: null };
      return;
    }
    const x: Vec3 = [
      raw.alpha - this.bias[0],
      raw.beta - this.bias[1],
      raw.gamma - this.bias[2],
    ];
    this.count++;
    const delta: Vec3 = [
      x[0] - this.mean[0],
      x[1] - this.mean[1],
      x[2] - this.mean[2],
    ];
    for (let i = 0; i < 3; i++) this.mean[i] += delta[i] / this.count;
    const after: Vec3 = [
      x[0] - this.mean[0],
      x[1] - this.mean[1],
      x[2] - this.mean[2],
    ];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) this.scatter[i][j] += delta[i] * after[j];
    if (this.count >= this.config.minimumSamples) {
      const p = principal(
        this.scatter.map((row) => row.map((v) => v / this.count)),
      );
      let next = p.axis;
      if (this.previousAxis && dot(next, this.previousAxis) < 0)
        next = [-next[0], -next[1], -next[2]];
      if (this.previousAxis) {
        const w = this.config.smoothAxisWeight;
        next =
          normalize([
            this.previousAxis[0] * (1 - w) + next[0] * w,
            this.previousAxis[1] * (1 - w) + next[1] * w,
            this.previousAxis[2] * (1 - w) + next[2] * w,
          ]) ?? next;
      }
      this.axis = this.previousAxis = next;
      this.ratio = p.ratio;
    }
    if (!this.axis) {
      this.processedSignal.push({ timestamp: sample.timestamp, value: null });
      return;
    }
    const signal = dot(x, this.axis);
    this.peak = Math.max(this.peak, Math.abs(signal));
    this.processedSignal.push({ timestamp: sample.timestamp, value: signal });
    this.detect(sample.timestamp, signal);
    this.previous = { timestamp: sample.timestamp, signal };
  }
  private detect(timestamp: number, signal: number) {
    const noise = Math.sqrt(
      this.noise.reduce((sum, n, i) => sum + (n * this.axis![i]) ** 2, 0),
    );
    const threshold = Math.max(
      noise * this.config.noiseHysteresisSigma,
      this.config.minimumAmplitudeDegPerSec * this.config.peakHysteresisRatio,
    );
    if (Math.abs(signal) < threshold) {
      this.previous = { timestamp, signal };
      return;
    }
    if (signal >= threshold) {
      if (this.armed === "negative")
        this.cross("negative-to-positive", timestamp, signal);
      this.armed = "positive";
    } else if (signal <= -threshold) {
      if (this.armed === "positive")
        this.cross("positive-to-negative", timestamp, signal);
      this.armed = "negative";
    }
  }
  private cross(
    direction: Crossing["direction"],
    timestamp: number,
    signalAfter: number,
  ) {
    const prev = this.previous;
    if (!prev || prev.signal === signalAfter) return;
    const fraction = Math.max(
      0,
      Math.min(1, -prev.signal / (signalAfter - prev.signal)),
    );
    const crossingTime =
      prev.timestamp + (timestamp - prev.timestamp) * fraction;
    const crossing: Crossing = {
      timestamp: crossingTime,
      direction,
      signalBefore: prev.signal,
      signalAfter,
    };
    this.crossings.push(crossing);
    // Count one cycle only between consecutive crossings of the same chosen phase.
    // The opposite-direction crossing is still retained and drawn, but overlaps
    // the same physical cycle and must not double the displayed cycle count.
    if (direction !== this.config.periodDirection) return;
    const key = direction === "positive-to-negative" ? "negative" : "positive";
    const last = this.lastByDirection[key];
    if (last !== null) {
      const seconds = (crossingTime - last) / 1000;
      if (
        seconds >= this.config.minimumPeriodSec &&
        seconds <= this.config.maximumPeriodSec
      ) {
        this.periods.push({
          startTimestamp: last,
          endTimestamp: crossingTime,
          seconds,
          direction,
        });
        this.lastByDirection[key] = crossingTime;
      } else if (seconds > this.config.maximumPeriodSec)
        this.lastByDirection[key] = crossingTime;
    } else this.lastByDirection[key] = crossingTime;
    if (
      last === null ||
      (crossingTime - last) / 1000 > this.config.maximumPeriodSec
    )
      this.lastByDirection[key] = crossingTime;
  }
  finish() {
    this.finished = true;
    return this.result();
  }
  result(): PendulumResult {
    const values = this.periods.map((p) => p.seconds);
    const noiseAlongAxis = this.axis
      ? Math.sqrt(
          this.noise.reduce((sum, n, i) => sum + (n * this.axis![i]) ** 2, 0),
        )
      : 0;
    const amplitudeFloor = Math.max(
      this.config.minimumAmplitudeDegPerSec,
      noiseAlongAxis * 6,
    );
    const hasDominantMotion =
      this.peak >= amplitudeFloor &&
      (this.ratio ?? 0) >= this.config.principalAxisRatio;
    const estimate =
      hasDominantMotion &&
      values.length >= this.config.minimumPeriodsForEstimate
        ? median(values)
        : null;
    const mad =
      estimate === null
        ? null
        : median(values.map((x) => Math.abs(x - estimate)));
    const frequency = estimate ? 1 / estimate : null;
    const noise = this.axis
      ? Math.sqrt(
          this.noise.reduce((sum, n, i) => sum + (n * this.axis![i]) ** 2, 0),
        )
      : null;
    let quality = "Слабое движение";
    if (
      this.count >= this.config.minimumSamples &&
      this.peak >= amplitudeFloor
    ) {
      if ((this.ratio ?? 0) < this.config.principalAxisRatio)
        quality =
          (this.ratio ?? 0) < 0.5
            ? "Маятник вращается в нескольких направлениях"
            : "Движение слишком хаотичное";
      else
        quality =
          estimate === null ? "Недостаточно колебаний" : "Хороший сигнал";
    }
    return {
      periodSec: estimate,
      frequencyHz: frequency,
      spreadSec: mad === null ? null : mad * 1.4826,
      completePeriods: values.length,
      durationSec:
        this.firstTimestamp === null || this.lastTimestamp === null
          ? 0
          : Math.max(0, (this.lastTimestamp - this.firstTimestamp) / 1000),
      sampleRateHz:
        this.processedSignal.length > 1 &&
        this.lastTimestamp! > this.firstTimestamp!
          ? ((this.motionCount - 1) * 1000) /
            (this.lastTimestamp! - this.firstTimestamp!)
          : null,
      dominantAxis: this.axis,
      dominantRatio: this.ratio,
      peakDegPerSec: this.count ? this.peak : null,
      noiseDegPerSec: noise,
      quality,
    };
  }
  export(): PendulumExport {
    return {
      algorithmVersion: PENDULUM_ALGORITHM_VERSION,
      config: this.config,
      gyroBias: this.bias,
      calibrationNoise: this.noise,
      dominantAxis: this.axis,
      processedSignal: this.processedSignal,
      crossings: this.crossings,
      individualPeriods: this.periods,
      result: this.result(),
    };
  }
}
