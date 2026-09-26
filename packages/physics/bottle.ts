import type { BottleComparison, BottleInput, BottleTrial, SelectionEvent } from '../contracts';
import { compareModels, fitModel } from './discovery';
import { trialSelection } from './pendulum';
export const airVolume = (input: BottleInput) => input.capacityM3 - input.waterM3;
/** Error bar for plotting: live spread is variability, entered values are bounds. */
export const toneError = (trial: BottleTrial) =>
  trial.tone.kind === 'live' ? trial.tone.spreadHz : trial.tone.frequencyErrorHz;
/**
 * Equal air volumes form a condition. Models compete on the original frequency scale; the
 * Helmholtz form f = a/√V is one candidate, not an assumed answer.
 */
export function compareBottle(
  trials: BottleTrial[],
  events: SelectionEvent[] = [],
): BottleComparison {
  if (new Set(trials.map((t) => t.provenance)).size > 1)
    throw new Error('Do not fit trials from different sources together.');
  const active = trialSelection(trials, events)
    .filter((t) => t.included)
    .map((t) => t.trial);
  const points = active.map((t) => ({
    id: t.id,
    x: airVolume(t.input),
    y: t.tone.frequencyHz,
  }));
  const result = compareModels(points, ['constant', 'linear', 'inverse-sqrt'] as const, {
    minConditions: 5,
    minRatio: 2,
    minMargin: 2,
  });
  const inverse = fitModel(
    points.map((p) => ({ ...p, x: 1 / p.x, y: p.y ** 2 })),
    'linear',
  );
  return {
    algorithmVersion: 'bottle-v1',
    inputTrialIds: active.map((t) => t.id),
    distinctVolumes: result.conditions,
    volumeRatio: result.ratio,
    fits: result.fits,
    bestModel: result.bestModel,
    status: result.status,
    inverseFit: inverse ? { slope: inverse.a, intercept: inverse.b } : null,
  };
}
/**
 * Explicit deterministic illustration from the Helmholtz resonator model with an assumed neck
 * (radius 10.5 mm, effective length 66 mm) and c = 343 m/s. Never used for real-data fitting.
 */
export function createBottleDemo(): BottleTrial[] {
  const area = Math.PI * 0.0105 ** 2,
    neck = 0.066,
    c = 343;
  return [0, 300, 600, 900, 1100].flatMap((waterMl, index) =>
    [-1.8, 1.1, 0.4].map((offset) => {
      const input = { capacityM3: 1.5e-3, waterM3: waterMl * 1e-6, volumeErrorM3: 2e-5 };
      const hz = (c / (2 * Math.PI)) * Math.sqrt(area / (airVolume(input) * neck));
      return {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        provenance: 'simulation' as const,
        input,
        tone: {
          kind: 'simulation' as const,
          frequencyHz: hz + offset + (index % 2) * 0.6,
          frequencyErrorHz: 3,
        },
      };
    }),
  );
}
