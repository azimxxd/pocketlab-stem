import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePendulumExperiment,
  experimentCsv,
  PendulumExperiment,
  type ExperimentTrial,
} from "../src/experiment";
import type { PendulumExport } from "../src/pendulum";

const lengths = [0.3, 0.4, 0.5, 0.6, 0.7];
const idealPeriod = (length: number, gravity = 9.81) =>
  2 * Math.PI * Math.sqrt(length / gravity);
const trial = (
  lengthMeters: number,
  periodSeconds: number,
  id = "unused",
): Omit<
  ExperimentTrial,
  "id" | "savedAt" | "excluded" | "exclusionReason"
> => ({
  lengthMeters,
  lengthUncertaintyMeters: null,
  periodSeconds,
  periodSpreadSeconds: null,
  frequencyHz: 1 / periodSeconds,
  completePeriods: 10,
  quality: "Хороший сигнал",
  individualGravityEstimateMs2: null,
  individualGravityUncertaintyMs2: null,
  referenceGravityMs2: 9.81,
  relativeDifferencePercent: null,
  gravityAlgorithmVersion: "simple-pendulum-gravity-1.0.0",
  recording: { sampleCount: 600 },
  pendulum: { algorithmVersion: id } as PendulumExport,
});

test("five ideal measured lengths recover g from the unconstrained linear fit", () => {
  const experiment = new PendulumExperiment();
  lengths.forEach((length) =>
    experiment.addTrial(trial(length, idealPeriod(length))),
  );
  const analysis = experiment.analyze();
  assert.equal(analysis.conditions.length, 5);
  assert.ok(analysis.fit);
  assert.ok(
    Math.abs(
      analysis.fit!.slopeSecondsSquaredPerMeter - (4 * Math.PI ** 2) / 9.81,
    ) < 1e-12,
  );
  assert.ok(Math.abs(analysis.fit!.interceptSecondsSquared) < 1e-12);
  assert.ok(Math.abs(analysis.fit!.gravityEstimateMs2! - 9.81) < 1e-10);
  assert.ok(analysis.fit!.rSquared! > 0.999999999);
  assert.ok(
    analysis.fit!.residuals.every(
      (item) => Math.abs(item.residualSeconds2) < 1e-12,
    ),
  );
});

test("fit preserves deterministic measurement noise and a nonzero intercept", () => {
  const experiment = new PendulumExperiment(),
    measurements = [0.002, -0.001, 0.003, -0.002, 0.001];
  lengths.forEach((length, index) =>
    experiment.addTrial(
      trial(length, Math.sqrt(3 * length + 0.1 + measurements[index])),
    ),
  );
  const fit = experiment.analyze().fit!;
  assert.ok(Math.abs(fit.slopeSecondsSquaredPerMeter - 3) < 0.02);
  assert.ok(Math.abs(fit.interceptSecondsSquared - 0.1) < 0.01);
  assert.ok(fit.gravityEstimateMs2 !== null);
  assert.ok(fit.rmseSecondsSquared > 0);
});

test("repeats are preserved and condition period uses the median", () => {
  const experiment = new PendulumExperiment(),
    base = lengths.map((length) => {
      const period = idealPeriod(length);
      return trial(length, period);
    });
  for (const item of base) experiment.addTrial(item);
  const center = idealPeriod(0.5);
  experiment.addTrial(trial(0.5, center - 0.01));
  experiment.addTrial(trial(0.5, center + 0.01));
  experiment.addTrial(trial(0.5, center * 2)); // a bad repeat remains visible
  experiment.addTrial(trial(0.5, center));
  const condition = experiment
    .analyze()
    .conditions.find((item) => item.lengthMeters === 0.5)!;
  assert.equal(condition.trialCount, 5);
  assert.equal(condition.trialIds.length, 5);
  assert.ok(Math.abs(condition.periodSeconds - center) < 1e-12);
  assert.equal(experiment.trials.length, 9);
  assert.equal(experimentCsv(experiment.trials).split("\n").length, 11);
});

test("outliers remain included unless the user explicitly excludes them", () => {
  const experiment = new PendulumExperiment();
  lengths.forEach((length) =>
    experiment.addTrial(trial(length, idealPeriod(length))),
  );
  const outlier = experiment.addTrial(trial(0.7, idealPeriod(0.7) * 2));
  assert.ok(
    Math.abs(experiment.analyze().fit!.gravityEstimateMs2! - 9.81) > 0.1,
  );
  assert.equal(experiment.excludeTrial(outlier.id, "Слабый сигнал"), true);
  assert.equal(outlier.excluded, true);
  assert.equal(outlier.exclusionReason, "Слабый сигнал");
  assert.ok(
    Math.abs(experiment.analyze().fit!.gravityEstimateMs2! - 9.81) < 1e-10,
  );
  assert.equal(experiment.restoreTrial(outlier.id), true);
  assert.equal(outlier.excluded, false);
});

test("does not fit fewer than four distinct lengths and skips invalid trials", () => {
  const tooFew = lengths.slice(0, 3).map(
    (length) =>
      ({
        ...trial(length, idealPeriod(length)),
        id: "trial",
        savedAt: "now",
        excluded: false,
        exclusionReason: null,
      }) as ExperimentTrial,
  );
  assert.equal(analyzePendulumExperiment(tooFew).fit, null);
  const full: (ExperimentTrial | null | undefined)[] = lengths.map(
    (length) =>
      ({
        ...trial(length, idealPeriod(length)),
        id: "trial",
        savedAt: "now",
        excluded: false,
        exclusionReason: null,
      }) as ExperimentTrial,
  );
  full.push(
    null,
    undefined,
    { ...(full[0] as ExperimentTrial), periodSeconds: 0 },
    { ...(full[1] as ExperimentTrial), lengthMeters: Number.NaN },
  );
  const analysis = analyzePendulumExperiment(full);
  assert.equal(analysis.distinctLengthCount, 5);
  assert.ok(Math.abs(analysis.fit!.gravityEstimateMs2! - 9.81) < 1e-10);
});

test("refuses to save a trial with a missing or invalid measured period", () => {
  const experiment = new PendulumExperiment();
  assert.throws(
    () => experiment.addTrial(trial(0.5, Number.NaN)),
    /корректной длины и периода/,
  );
  assert.throws(
    () => experiment.addTrial(trial(0.5, 0)),
    /корректной длины и периода/,
  );
});
