import { describe, it, expect } from 'vitest';
import {
  analyzePendulum,
  comparePendulum,
  parseDecimal,
  trialSelection,
} from '../packages/physics/pendulum';
import {
  pendulumInputSchema,
  pendulumInvestigationSchema,
  type PendulumTrial,
  type PendulumInput,
} from '../packages/contracts';
const input: PendulumInput = {
  lengthM: 0.5,
  cycles: 10,
  elapsedS: 14.2,
  lengthErrorM: 0.005,
  timingErrorS: 0.3,
};
const trial = (length: number, period: number): PendulumTrial => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  provenance: 'manual',
  acquisitionKind: 'entered',
  input: { ...input, lengthM: length, elapsedS: period * 10 },
});
const lengths = [0.2, 0.35, 0.5, 0.75, 1];
describe('manual pendulum and discovery', () => {
  it('uses complete periods and SI, not half-period or cm', () => {
    const a = analyzePendulum(input);
    expect(a.period).toBe(1.42);
    expect(a.g).toBeCloseTo(9.78933, 3);
    expect(a.periodError).toBeCloseTo(0.03);
  });
  it('propagates bounded errors through extrema, not a confidence interval', () => {
    const a = analyzePendulum(input);
    expect(a.gLow).toBeCloseTo((4 * Math.PI ** 2 * 0.495) / 1.45 ** 2);
    expect(a.gHigh).toBeCloseTo((4 * Math.PI ** 2 * 0.505) / 1.39 ** 2);
    expect(a.gLow).toBeLessThan(a.g);
    expect(a.gHigh).toBeGreaterThan(a.g);
  });
  it('rejects nonphysical and malformed inputs without clamping', () => {
    for (const patch of [
      { cycles: 0 },
      { cycles: 2.5 },
      { lengthM: NaN },
      { elapsedS: 0 },
      { timingErrorS: 20 },
      { lengthErrorM: 1 },
    ])
      expect(pendulumInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('accepts decimal commas and rejects empty/ambiguous numeric text', () => {
    expect(parseDecimal(' 0,50 ')).toBe(0.5);
    for (const value of ['', '1,2,3', '-1', 'Infinity', '1e3', '0x10'])
      expect(parseDecimal(value)).toBeNaN();
  });
  it('does not force a measured g to the reference value', () => {
    expect(analyzePendulum({ ...input, elapsedS: 20 }).g).toBeCloseTo(Math.PI ** 2 / 2);
  });
  it('identifies root model and recovers slope-derived gravity', () => {
    const data = lengths.map((l) => trial(l, 2 * Math.PI * Math.sqrt(l / 9.7)));
    const r = comparePendulum(data);
    expect(r.bestModel).toBe('sqrt');
    expect(r.squaredFit?.g).toBeCloseTo(9.7, 10);
    expect(r.fits.find((f) => f.model === 'sqrt')?.cvRmse).toBeLessThan(1e-12);
  });
  it('identifies a linear dataset instead of preferring a physics answer', () => {
    expect(comparePendulum(lengths.map((l) => trial(l, 1 + 2 * l))).bestModel).toBe('linear');
  });
  it('does not choose a winner for identical periods with tied models', () => {
    expect(comparePendulum(lengths.map((l) => trial(l, 1.5))).status).toBe('ambiguous');
  });
  it('repeated measurements of one length do not count as five conditions', () => {
    const r = comparePendulum(Array.from({ length: 15 }, () => trial(0.5, 1.42)));
    expect(r.distinctLengths).toBe(1);
    expect(r.status).toBe('insufficient');
    expect(r.fits.every((f) => f.cvRmse === null)).toBe(true);
    expect(r.squaredFit).toBeNull();
  });
  it('does not choose a winner in a narrow length range', () => {
    const r = comparePendulum([0.5, 0.51, 0.52, 0.53, 0.54].map((l) => trial(l, 2 * Math.sqrt(l))));
    expect(r.status).toBe('narrow-range');
    expect(r.bestModel).toBeNull();
  });
  it('holds all repeats at a length out together', () => {
    const base = lengths.map((l) => trial(l, 2 * Math.sqrt(l) + 0.05 * l));
    const repeat = base.flatMap((t) => [t, { ...t, id: crypto.randomUUID() }]);
    const one = comparePendulum(base),
      two = comparePendulum(repeat);
    for (const fit of one.fits)
      expect(two.fits.find((f) => f.model === fit.model)?.cvRmse).toBeCloseTo(fit.cvRmse!, 12);
  });
  it('exclusion preserves data and a restore event brings the trial back', () => {
    const data = lengths.map((l) => trial(l, 2 * Math.sqrt(l)));
    const event = {
      id: crypto.randomUUID(),
      trialId: data[0].id,
      included: false,
      reason: 'Mistimed cycle',
      at: new Date().toISOString(),
    };
    expect(comparePendulum(data, [event]).distinctLengths).toBe(4);
    expect(data).toHaveLength(5);
    const restore = { ...event, id: crypto.randomUUID(), included: true, reason: 'Restored' };
    expect(trialSelection(data, [event, restore])[0].included).toBe(true);
    expect(comparePendulum(data, [event, restore]).distinctLengths).toBe(5);
  });
  it('prevents fitting simulated data with manual observations', () => {
    expect(() =>
      comparePendulum([
        trial(0.2, 1),
        { ...trial(0.5, 1.4), provenance: 'simulation', acquisitionKind: 'simulation' },
      ]),
    ).toThrow(/mixed/);
  });
  it('allows an entirely excluded series without NaN', () => {
    const data = [trial(0.5, 1.42)];
    const r = comparePendulum(data, [
      {
        id: crypto.randomUUID(),
        trialId: data[0].id,
        included: false,
        reason: 'Counter error',
        at: new Date().toISOString(),
      },
    ]);
    expect(r.fits).toHaveLength(0);
    expect(r.status).toBe('insufficient');
    expect(r.lengthRatio).toBe(0);
  });
  it('validates the versioned series and its references', () => {
    const trials = [trial(0.5, 1.42)];
    const now = new Date().toISOString();
    const doc = {
      schemaVersion: 2,
      scenarioId: 'pendulum-01',
      scenarioVersion: 1,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      provenance: 'manual',
      hypothesis: 'T grows',
      hypothesisAt: now,
      conclusion: 'More data needed',
      trials,
      selectionEvents: [],
      analyses: [
        {
          id: crypto.randomUUID(),
          at: now,
          revision: 1,
          conclusion: 'More data needed',
          selectionEventIds: [],
          result: comparePendulum(trials),
        },
      ],
    };
    expect(pendulumInvestigationSchema.safeParse(doc).success).toBe(true);
    expect(
      pendulumInvestigationSchema.safeParse({ ...doc, trials: [...trials, ...trials] }).success,
    ).toBe(false);
    expect(
      pendulumInvestigationSchema.safeParse({ ...doc, provenance: 'simulation' }).success,
    ).toBe(false);
  });
});
