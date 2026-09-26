import {
  pendulumInputSchema,
  type PendulumInput,
  type PendulumTrial,
  type SelectionEvent,
  type ModelId,
  type ModelFit,
  type PendulumComparison,
} from '../contracts/pendulum';
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
export function trialSelection(trials: PendulumTrial[], events: SelectionEvent[]) {
  return trials.map((trial) => ({
    trial,
    event: events.filter((e) => e.trialId === trial.id).at(-1),
    included: events.filter((e) => e.trialId === trial.id).at(-1)?.included ?? true,
  }));
}
type Point = { id: string; x: number; y: number };
const average = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
function fit(points: Point[], model: ModelId): { a: number; b: number } | null {
  if (!points.length) return null;
  if (model === 'constant') return { a: 0, b: average(points.map((p) => p.y)) };
  if (model === 'sqrt')
    return {
      a: points.reduce((s, p) => s + Math.sqrt(p.x) * p.y, 0) / points.reduce((s, p) => s + p.x, 0),
      b: 0,
    };
  const x = average(points.map((p) => p.x)),
    y = average(points.map((p) => p.y));
  const variance = points.reduce((s, p) => s + (p.x - x) ** 2, 0);
  if (variance < 1e-12) return null;
  const a = points.reduce((s, p) => s + (p.x - x) * (p.y - y), 0) / variance;
  return { a, b: y - a * x };
}
export function predict(model: ModelId, params: { a: number; b: number }, lengthM: number) {
  return model === 'sqrt' ? params.a * Math.sqrt(lengthM) : params.a * lengthM + params.b;
}
const rmse = (values: number[]) => Math.sqrt(average(values.map((v) => v * v)));
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
  const lengths = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const ratio = lengths.length ? lengths.at(-1)! / lengths[0] : 0;
  const sufficient = lengths.length >= 5;
  const fits: ModelFit[] = [];
  for (const model of ['constant', 'linear', 'sqrt'] as const) {
    const params = fit(points, model);
    if (!params) continue;
    const residuals = points.map((p) => ({
      trialId: p.id,
      value: p.y - predict(model, params, p.x),
    }));
    let cvRmse: number | null = null;
    if (sufficient) {
      const errors: number[] = [];
      for (const length of lengths) {
        const train = points.filter((p) => p.x !== length);
        const fitted = fit(train, model);
        if (!fitted) break;
        const held = points.filter((p) => p.x === length);
        errors.push(average(held.map((p) => (p.y - predict(model, fitted, p.x)) ** 2)));
      }
      if (errors.length === lengths.length) cvRmse = Math.sqrt(average(errors));
    }
    fits.push({ model, ...params, rmse: rmse(residuals.map((r) => r.value)), cvRmse, residuals });
  }
  const ranked = fits.filter((f) => f.cvRmse !== null).sort((a, b) => a.cvRmse! - b.cvRmse!);
  const clear =
    ranked.length > 1 &&
    ranked[1].cvRmse! - ranked[0].cvRmse! > Math.max(0.01, ranked[0].cvRmse! * 0.05);
  const status = !sufficient
    ? 'insufficient'
    : ratio < 2
      ? 'narrow-range'
      : clear
        ? 'compared'
        : 'ambiguous';
  const squared = fit(
    points.map((p) => ({ ...p, y: p.y ** 2 })),
    'linear',
  );
  return {
    algorithmVersion: 'pendulum-v1',
    inputTrialIds: active.map((t) => t.id),
    distinctLengths: lengths.length,
    lengthRatio: ratio,
    fits,
    bestModel: status === 'compared' ? ranked[0].model : null,
    status,
    squaredFit: squared
      ? {
          slope: squared.a,
          intercept: squared.b,
          g: sufficient && ratio >= 2 && squared.a > 0 ? (4 * Math.PI ** 2) / squared.a : null,
        }
      : null,
  };
}
