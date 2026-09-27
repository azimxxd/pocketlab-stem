import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calibrate,
  MotionStartDetector,
  PacketOrder,
  RecordingSession,
  SensorBuffer,
  sampleRate,
} from "../src/core";
import { sampleSchema, type SensorSample } from "../src/contracts";
import { deviceQuaternion, screenRotation } from "../src/laptop/orientation";
import { Vector3 } from "three";
export function sample(i: number, timestamp = i * 20): SensorSample {
  return {
    sequence: i,
    timestamp,
    source: "motion",
    acceleration: { x: 0, y: 0, z: 0 },
    accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
    rotationRate: { alpha: 0.1, beta: 0.2, gamma: 0 },
    orientation: { alpha: null, beta: null, gamma: null },
    orientationTimestamp: null,
    screenAngle: 0,
  };
}
const stationary = () => Array.from({ length: 131 }, (_, i) => sample(i));
test("stationary calibration estimates gyro bias, gravity, rate and noise", () => {
  const c = calibrate(stationary());
  assert.equal(c.stable, true);
  assert.equal(c.rate, 50);
  assert.ok(Math.abs(c.channels["rotationRate.alpha"].mean! - 0.1) < 1e-10);
  assert.ok(c.channels["accelerationIncludingGravity.z"].sd! < 1e-10);
});
test("calibration fails for sustained rotation, shaking, short and missing streams", () => {
  assert.equal(
    calibrate(
      stationary().map((s) => ({
        ...s,
        rotationRate: { alpha: 8, beta: 0, gamma: 0 },
      })),
    ).stable,
    false,
  );
  assert.equal(
    calibrate(
      stationary().map((s, i) => ({
        ...s,
        acceleration: { x: i % 2 ? 2 : -2, y: 0, z: 0 },
      })),
    ).stable,
    false,
  );
  assert.equal(calibrate(stationary().slice(0, 50)).stable, false);
  assert.equal(
    calibrate(
      stationary().map((s) => ({
        ...s,
        acceleration: { x: null, y: null, z: null },
        accelerationIncludingGravity: { x: null, y: null, z: null },
        rotationRate: { alpha: null, beta: null, gamma: null },
      })),
    ).stable,
    false,
  );
});
test("noise does not trigger motion; sustained small rotation does; brief spikes reset", () => {
  const d = new MotionStartDetector(calibrate(stationary()));
  for (let i = 0; i < 20; i++)
    assert.equal(
      d.update({
        ...sample(i),
        rotationRate: { alpha: 0.15, beta: 0.2, gamma: 0 },
      }),
      false,
    );
  const moving = (i: number) => ({
    ...sample(i),
    rotationRate: { alpha: 9, beta: 0, gamma: 0 },
  });
  assert.equal(d.update(moving(30)), false);
  assert.equal(d.update(sample(31)), false);
  for (let i = 32; i < 36; i++) assert.equal(d.update(moving(i)), false);
  assert.equal(d.update(moving(36)), true);
});
test("motion detection works with gravity-only accelerometer and missing gyro", () => {
  const data = stationary().map((s) => ({
    ...s,
    rotationRate: { alpha: null, beta: null, gamma: null },
    acceleration: { x: null, y: null, z: null },
  }));
  const d = new MotionStartDetector(calibrate(data));
  let triggered = false;
  for (let i = 0; i < 10; i++)
    triggered = d.update({
      ...data[i],
      accelerationIncludingGravity: { x: 1, y: 0, z: 9.81 },
    });
  assert.equal(triggered, true);
});
test("rate uses real irregular timestamps and does not double-count orientation", () => {
  const a = [
    sample(0, 1000),
    sample(1, 1020),
    sample(2, 1055),
    sample(3, 1100),
  ];
  assert.equal(sampleRate(a), 30);
  assert.equal(
    sampleRate(a.flatMap((s) => [s, { ...s, source: "orientation" as const }])),
    30,
  );
  assert.equal(sampleRate([sample(0)]), null);
});
test("packet gaps, duplicates and late packets counted without corrupting last sequence", () => {
  const p = new PacketOrder();
  assert.equal(p.accept(sample(100)), true);
  assert.equal(p.missing, 0);
  p.accept(sample(103));
  assert.equal(p.missing, 2);
  assert.equal(p.accept(sample(102)), false);
  assert.equal(p.accept(sample(103)), false);
  assert.equal(p.last, 103);
  assert.equal(p.outOfOrder, 2);
});
test("missing values remain null; invalid finite values and missing structural fields rejected", () => {
  const s = sample(0);
  s.acceleration.x = null;
  assert.equal(sampleSchema.parse(s).acceleration.x, null);
  assert.equal(sampleSchema.safeParse({ ...s, timestamp: NaN }).success, false);
  assert.equal(
    sampleSchema.safeParse({ ...s, rotationRate: undefined }).success,
    false,
  );
});
test("recording is independent of bounded history and preserves raw packet values", () => {
  const r = new RecordingSession("ABC234", calibrate(stationary()), "test");
  const b = new SensorBuffer();
  for (let i = 0; i < 1500; i++) {
    const s = sample(i);
    r.add(s);
    b.add(s);
  }
  r.stop("manual");
  r.add(sample(1501));
  assert.equal(r.samples.length, 1500);
  assert.ok(b.samples.length <= 751);
  assert.equal(r.export().sampleCount, 1500);
  assert.ok(r.export().missingChannels.includes("orientation.alpha"));
  assert.equal(r.samples[0].rotationRate.alpha, 0.1);
});
test("orientation conversion maps flat phone normal upward and upright phone top upward", () => {
  const flat = deviceQuaternion({ alpha: 0, beta: 0, gamma: 0 })!;
  assert.ok(
    new Vector3(0, 0, 1)
      .applyQuaternion(flat)
      .distanceTo(new Vector3(0, 1, 0)) < 1e-10,
  );
  const upright = deviceQuaternion({ alpha: 0, beta: 90, gamma: 0 })!;
  assert.ok(
    new Vector3(0, 1, 0)
      .applyQuaternion(upright)
      .distanceTo(new Vector3(0, 1, 0)) < 1e-10,
  );
  assert.equal(deviceQuaternion({ alpha: null, beta: 90, gamma: 0 }), null);
  assert.equal(screenRotation(90), Math.PI / 2);
});
