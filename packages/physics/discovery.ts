/**
 * Scenario-independent model discovery: fit candidate models on the original y scale and compare
 * them by leave-one-condition-out prediction error. Equal x values form one condition; all repeats
 * of a condition are held out together.
 */
export type Basis = 'constant' | 'linear' | 'sqrt' | 'inverse-sqrt';
export type DiscoveryPoint = { id: string; x: number; y: number };
export type Params = { a: number; b: number };
export type DiscoveryStatus = 'insufficient' | 'narrow-range' | 'ambiguous' | 'compared';
export type DiscoveryFit<M extends Basis> = Params & {
  model: M;
  rmse: number;
  cvRmse: number | null;
  residuals: { trialId: string; value: number }[];
};
const average = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const rmse = (values: number[]) => Math.sqrt(average(values.map((v) => v * v)));
/** Single-parameter models through the origin: y = a·g(x). */
const through: Partial<Record<Basis, (x: number) => number>> = {
  sqrt: Math.sqrt,
  'inverse-sqrt': (x) => 1 / Math.sqrt(x),
};
export function fitModel(points: DiscoveryPoint[], model: Basis): Params | null {
  if (!points.length) return null;
  if (model === 'constant') return { a: 0, b: average(points.map((p) => p.y)) };
  const g = through[model];
  if (g) {
    const denominator = points.reduce((s, p) => s + g(p.x) ** 2, 0);
    return denominator > 0
      ? { a: points.reduce((s, p) => s + g(p.x) * p.y, 0) / denominator, b: 0 }
      : null;
  }
  const x = average(points.map((p) => p.x)),
    y = average(points.map((p) => p.y));
  const variance = points.reduce((s, p) => s + (p.x - x) ** 2, 0);
  if (variance < 1e-12 * Math.max(1, x * x)) return null;
  const a = points.reduce((s, p) => s + (p.x - x) * (p.y - y), 0) / variance;
  return { a, b: y - a * x };
}
export function predictModel(model: Basis, params: Params, x: number) {
  const g = through[model];
  return g ? params.a * g(x) : params.a * x + params.b;
}
export function compareModels<M extends Basis>(
  points: DiscoveryPoint[],
  models: readonly M[],
  rules: { minConditions: number; minRatio: number; minMargin: number },
) {
  const conditions = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const ratio = conditions.length ? conditions.at(-1)! / conditions[0] : 0;
  const sufficient = conditions.length >= rules.minConditions;
  const fits: DiscoveryFit<M>[] = [];
  for (const model of models) {
    const params = fitModel(points, model);
    if (!params) continue;
    const residuals = points.map((p) => ({
      trialId: p.id,
      value: p.y - predictModel(model, params, p.x),
    }));
    let cvRmse: number | null = null;
    if (sufficient) {
      const errors: number[] = [];
      for (const condition of conditions) {
        const fitted = fitModel(
          points.filter((p) => p.x !== condition),
          model,
        );
        if (!fitted) break;
        const held = points.filter((p) => p.x === condition);
        errors.push(average(held.map((p) => (p.y - predictModel(model, fitted, p.x)) ** 2)));
      }
      if (errors.length === conditions.length) cvRmse = Math.sqrt(average(errors));
    }
    fits.push({ model, ...params, rmse: rmse(residuals.map((r) => r.value)), cvRmse, residuals });
  }
  const ranked = fits.filter((f) => f.cvRmse !== null).sort((a, b) => a.cvRmse! - b.cvRmse!);
  const clear =
    ranked.length > 1 &&
    ranked[1].cvRmse! - ranked[0].cvRmse! > Math.max(rules.minMargin, ranked[0].cvRmse! * 0.05);
  const status: DiscoveryStatus = !sufficient
    ? 'insufficient'
    : ratio < rules.minRatio
      ? 'narrow-range'
      : clear
        ? 'compared'
        : 'ambiguous';
  return {
    conditions: conditions.length,
    ratio,
    fits,
    bestModel: status === 'compared' ? ranked[0].model : null,
    status,
  };
}
