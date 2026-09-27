import { test } from "node:test";
import assert from "node:assert/strict";
import { PendulumAnalyzer } from "../src/pendulum";
import type { Calibration } from "../src/core";
import type { SensorSample } from "../src/contracts";

const bias = [1.2, -0.7, 2.1] as const;
const stationaryCalibration: Calibration = {
  durationMs: 2600,
  rate: 100,
  stable: true,
  reason: "test",
  channels: {
    "rotationRate.alpha": {
      count: 260,
      mean: bias[0],
      sd: 0.025,
      min: 1.1,
      max: 1.3,
    },
    "rotationRate.beta": {
      count: 260,
      mean: bias[1],
      sd: 0.025,
      min: -0.8,
      max: -0.6,
    },
    "rotationRate.gamma": {
      count: 260,
      mean: bias[2],
      sd: 0.025,
      min: 2,
      max: 2.2,
    },
  },
};

function fixture(
  period: number,
  axis: [number, number, number],
  options: {
    noise?: number;
    decay?: boolean;
    jitter?: boolean;
    drops?: boolean;
    seed?: number;
    duration?: number;
  } = {},
) {
  const analyzer = new PendulumAnalyzer(stationaryCalibration);
  let seed = options.seed ?? 47;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  let previousTime = 0,
    sequence = 0;
  for (let i = 0; i < Math.ceil((options.duration ?? 18) * 100); i++) {
    if (options.drops && i % 43 === 17) continue;
    const jitter = options.jitter ? random() * 5 : 0;
    const timestamp = Math.max(previousTime + 1, i * 10 + jitter);
    previousTime = timestamp;
    const t = timestamp / 1000,
      envelope = options.decay ? Math.exp(-0.035 * t) : 1;
    const wave = 9 * envelope * Math.cos((2 * Math.PI * t) / period);
    const n = options.noise ?? 0;
    const measured = axis.map(
      (component, index) => bias[index] + component * wave + random() * n,
    );
    const sample: SensorSample = {
      sequence: sequence++,
      timestamp,
      source: "motion",
      acceleration: { x: null, y: null, z: null },
      accelerationIncludingGravity: { x: null, y: null, z: null },
      rotationRate: {
        alpha: measured[0],
        beta: measured[1],
        gamma: measured[2],
      },
      orientation: { alpha: null, beta: null, gamma: null },
      orientationTimestamp: null,
      screenAngle: 0,
    };
    analyzer.add(sample);
  }
  return analyzer;
}

for (const period of [0.8, 1, 1.5, 2]) {
  test(`detects complete signed oscillations for true T=${period}s`, () => {
    const analyzer = fixture(period, [1, 0, 0]),
      result = analyzer.finish();
    assert.ok(
      analyzer.periods.length >= 5,
      `period count ${analyzer.periods.length}`,
    );
    assert.ok(
      Math.abs(result.periodSec! - period) < 0.025,
      `measured ${result.periodSec}`,
    );
    assert.ok(Math.abs(result.frequencyHz! - 1 / period) < 0.025);
  });
}

test("T/2 regression: true 2.0 s period is not reported as 1.0 s", () => {
  const analyzer = fixture(2, [0.3, 0.4, 0.8660254]);
  const result = analyzer.finish();
  assert.ok(Math.abs(result.periodSec! - 2) < 0.02, JSON.stringify(result));
  assert.ok(Math.abs(result.periodSec! - 1) > 0.9);
  assert.equal(analyzer.export().algorithmVersion, "pca-zero-crossing-1.0.0");
  assert.ok(analyzer.export().processedSignal.length > 1000);
  assert.ok(analyzer.export().crossings.length > 10);
  assert.ok(analyzer.export().individualPeriods.length >= 5);
});

test("PCA recovers a signed signal for arbitrary phone gyro orientations", () => {
  const axes: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ] = [
    [1, 0, 0],
    [0, 1, 0],
    [0.2672612, -0.5345225, 0.8017837],
  ];
  for (const axis of axes) {
    const a = fixture(1.5, axis, { noise: 0.12 });
    const r = a.finish();
    assert.ok(Math.abs(r.periodSec! - 1.5) < 0.025, JSON.stringify(r));
    assert.ok(r.dominantAxis);
    assert.ok(
      Math.abs(r.dominantAxis.reduce((sum, v, i) => sum + v * axis[i], 0)) >
        0.98,
    );
    assert.ok(a.processedSignal.some((p) => p.value !== null && p.value < 0));
    assert.ok(a.processedSignal.some((p) => p.value !== null && p.value > 0));
  }
});

test("tolerates noise, gyro bias, decaying amplitude, timestamp jitter and dropped samples", () => {
  const analyzer = fixture(1.2, [0.3, 0.4, 0.8660254], {
    noise: 0.2,
    decay: true,
    jitter: true,
    drops: true,
    seed: 2026,
  });
  const result = analyzer.finish();
  assert.ok(result.periodSec !== null, JSON.stringify(result));
  assert.ok(Math.abs(result.periodSec! - 1.2) < 0.04, JSON.stringify(result));
  assert.ok(analyzer.crossings.length > analyzer.periods.length);
});

test("does not give a period estimate for multi-axis chaotic rotation", () => {
  const analyzer = new PendulumAnalyzer(stationaryCalibration);
  for (let i = 0; i < 2400; i++) {
    const timestamp = i * 10,
      t = timestamp / 1000;
    const sample: SensorSample = {
      sequence: i,
      timestamp,
      source: "motion",
      acceleration: { x: null, y: null, z: null },
      accelerationIncludingGravity: { x: null, y: null, z: null },
      rotationRate: {
        alpha: bias[0] + 7 * Math.cos((2 * Math.PI * t) / 1.1),
        beta: bias[1] + 7 * Math.cos((2 * Math.PI * t) / 1.7),
        gamma: bias[2] + 6 * Math.sin((2 * Math.PI * t) / 0.8),
      },
      orientation: { alpha: null, beta: null, gamma: null },
      orientationTimestamp: null,
      screenAngle: 0,
    };
    analyzer.add(sample);
  }
  const result = analyzer.finish();
  assert.equal(result.periodSec, null);
  assert.match(result.quality, /нескольких направлениях|хаотичное/);
});

test("requires five valid complete periods before publishing a result", () => {
  const short = fixture(2, [0, 0, 1], { duration: 6 });
  const result = short.finish();
  assert.ok(short.periods.length < 5);
  assert.equal(result.periodSec, null);
  assert.equal(result.frequencyHz, null);
});
