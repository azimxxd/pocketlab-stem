import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateGravity,
  parseLengthUncertaintyCm,
  parsePendulumLengthCm,
  REFERENCE_GRAVITY_MS2,
} from "../src/physics";

test("measured period and length recover the reference value near Earth", () => {
  const period = 2 * Math.PI * Math.sqrt(1 / REFERENCE_GRAVITY_MS2),
    result = estimateGravity({ lengthMeters: 1, periodSeconds: period });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.ok(Math.abs(result.gravityMs2 - 9.81) < 1e-10);
  assert.equal(result.uncertaintyMs2, undefined);
});

test("half-meter pendulum uses the measured period without adjustment", () => {
  const period = 2 * Math.PI * Math.sqrt(0.5 / 9.81),
    result = estimateGravity({ lengthMeters: 0.5, periodSeconds: period });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.ok(Math.abs(result.gravityMs2 - 9.81) < 1e-10);
  assert.equal(result.referenceGravityMs2, 9.81);
});

test("rejects empty, non-finite, negative, zero and tiny UI lengths", () => {
  for (const value of ["", "NaN", "-2", "0", "0.9"])
    assert.equal(parsePendulumLengthCm(value).valid, false, value);
  assert.deepEqual(parsePendulumLengthCm("50"), {
    valid: true,
    lengthMeters: 0.5,
  });
  assert.deepEqual(parsePendulumLengthCm("50,5"), {
    valid: true,
    lengthMeters: 0.505,
  });
});

test("rejects zero and negative periods and invalid physical lengths", () => {
  for (const periodSeconds of [0, -1, Number.NaN])
    assert.equal(
      estimateGravity({ lengthMeters: 1, periodSeconds }).valid,
      false,
    );
  assert.equal(
    estimateGravity({ lengthMeters: 0, periodSeconds: 2 }).valid,
    false,
  );
});

test("propagates stated length and period uncertainty only when both are known", () => {
  const lengthMeters = 0.5,
    periodSeconds = 2 * Math.PI * Math.sqrt(lengthMeters / 9.81),
    lengthUncertaintyMeters = 0.005,
    periodUncertaintySeconds = 0.01,
    result = estimateGravity({
      lengthMeters,
      periodSeconds,
      lengthUncertaintyMeters,
      periodUncertaintySeconds,
    });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const expected =
    result.gravityMs2 *
    Math.sqrt(
      (lengthUncertaintyMeters / lengthMeters) ** 2 +
        ((2 * periodUncertaintySeconds) / periodSeconds) ** 2,
    );
  assert.ok(Math.abs((result.uncertaintyMs2 ?? 0) - expected) < 1e-12);
  assert.ok(result.relativeDifferencePercent < 1e-10);
  const withoutLengthUncertainty = estimateGravity({
    lengthMeters,
    periodSeconds,
    periodUncertaintySeconds,
  });
  assert.equal(
    withoutLengthUncertainty.valid && withoutLengthUncertainty.uncertaintyMs2,
    undefined,
  );
});

test("optional length uncertainty stays unknown when blank and rejects negatives", () => {
  assert.deepEqual(parseLengthUncertaintyCm(""), { valid: true });
  assert.deepEqual(parseLengthUncertaintyCm("0,5"), {
    valid: true,
    uncertaintyMeters: 0.005,
  });
  assert.equal(parseLengthUncertaintyCm("-0.5").valid, false);
});
