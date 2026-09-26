import {
  pendulumInputSchema,
  type PendulumInput,
  type PendulumTrial,
  type SelectionEvent,
  type ModelId,
  type PendulumComparison,
} from '../contracts/pendulum';
import { compareModels, fitModel, predictModel } from './discovery';
export function parseDecimal(text: string): number {
  const clean = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
}
export function analyzePendulum(input: PendulumInput) {
  const v = pendulumInputSchema.parse(input);
  const period = v.elapsedS / v.cycles;
  const periodError = v.timingErrorS / v.cycles;
  const g = (4 * Math.PI ** 2 * v.lengthM) / period ** 2;
  return {
    period,
    periodError,
    g,
    gLow: (4 * Math.PI ** 2 * (v.lengthM - v.lengthErrorM)) / (period + periodError) ** 2,
    gHigh: (4 * Math.PI ** 2 * (v.lengthM + v.lengthErrorM)) / (period - periodError) ** 2,
    issues: [
      ...(v.cycles < 5 ? ['FEW_CYCLES'] : []),
      ...(v.lengthErrorM / v.lengthM > 0.05 ? ['LENGTH_ERROR'] : []),
      ...(v.timingErrorS / v.elapsedS > 0.05 ? ['TIMING_ERROR'] : []),
    ],
  };
}
export function trialSelection<T extends { id: string }>(trials: T[], events: SelectionEvent[]) {
  return trials.map((trial) => ({
    trial,
    event: events.filter((e) => e.trialId === trial.id).at(-1),
    included: events.filter((e) => e.trialId === trial.id).at(-1)?.included ?? true,
  }));
}
export function predict(model: ModelId, params: { a: number; b: number }, lengthM: number) {
  return predictModel(model, params, lengthM);
}
/** Equal input lengths form a condition. All repeats are held out together. */
export function comparePendulum(
  trials: PendulumTrial[],
  events: SelectionEvent[] = [],
): PendulumComparison {
  if (new Set(trials.map((t) => t.provenance)).size > 1)
    throw new Error('Do not fit mixed real and simulated trials.');
  const active = trialSelection(trials, events)
    .filter((t) => t.included)
    .map((t) => t.trial);
  const points = active.map((t) => ({
    id: t.id,
    x: t.input.lengthM,
    y: analyzePendulum(t.input).period,
  }));
  const result = compareModels(points, ['constant', 'linear', 'sqrt'] as const, {
    minConditions: 5,
    minRatio: 2,
    minMargin: 0.01,
  });
  const squared = fitModel(
    points.map((p) => ({ ...p, y: p.y ** 2 })),
    'linear',
  );
  const usable = result.conditions >= 5 && result.ratio >= 2;
  return {
    algorithmVersion: 'pendulum-v1',
    inputTrialIds: active.map((t) => t.id),
    distinctLengths: result.conditions,
    lengthRatio: result.ratio,
    fits: result.fits,
    bestModel: result.bestModel,
    status: result.status,
    squaredFit: squared
      ? {
          slope: squared.a,
          intercept: squared.b,
          g: usable && squared.a > 0 ? (4 * Math.PI ** 2) / squared.a : null,
        }
      : null,
  };
}
