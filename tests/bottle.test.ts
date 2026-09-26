import { describe, it, expect } from 'vitest';
import { dominantPeak, steadyTone } from '../packages/physics/sound';
import { compareBottle, createBottleDemo, airVolume } from '../packages/physics/bottle';
import { compareModels } from '../packages/physics/discovery';
import {
  bottleInvestigationSchema,
  bottleTrialSchema,
  type BottleTrial,
} from '../packages/contracts';
/** dB spectrum of a Blackman-windowed sine, as AnalyserNode computes it (bins up to 8 kHz). */
function blackmanSpectrum(hz: number, fs: number, n = 4096) {
  const signal = Array.from({ length: n }, (_, i) => {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
    return w * Math.sin((2 * Math.PI * hz * i) / fs);
  });
  const bins = new Float32Array(n / 2).fill(-Infinity);
  for (let k = 0; k < Math.floor((8000 * n) / fs) + 2; k++) {
    let re = 0,
      im = 0;
    for (let i = 0; i < n; i++) {
      re += signal[i] * Math.cos((2 * Math.PI * k * i) / n);
      im -= signal[i] * Math.sin((2 * Math.PI * k * i) / n);
    }
    bins[k] = 20 * Math.log10(Math.hypot(re, im) / n + 1e-12);
  }
  return bins;
}
const trial = (
  waterMl: number,
  hz: number,
  kind: 'manual' | 'simulation' = 'manual',
): BottleTrial => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  provenance: kind,
  input: { capacityM3: 1.5e-3, waterM3: waterMl * 1e-6, volumeErrorM3: 2e-5 },
  tone: { kind, frequencyHz: hz, frequencyErrorHz: 3 },
});
describe('sub-bin peak for sustained tones', () => {
  for (const fs of [44100, 48000])
    for (const hz of [123.4, 187.9, 440])
      it(`recovers ${hz} Hz at ${fs} within 0.1 bin`, () => {
        const bins = blackmanSpectrum(hz, fs);
        const binStep = fs / 4096;
        const refined = dominantPeak(bins, fs, 4096, true).hz!;
        const plain = dominantPeak(bins, fs, 4096).hz!;
        expect(Math.abs(refined - hz)).toBeLessThan(0.1 * binStep);
        expect(Math.abs(plain - hz)).toBeLessThanOrEqual(0.5 * binStep + 1e-9);
      });
});
describe('steady tone', () => {
  const frames = (values: (number | null)[]) => values.map((hz, i) => ({ t: i * 0.05, hz }));
  it('ignores onset and breath noise around a stable plateau', () => {
    const tone = steadyTone(frames([null, 300, 180, ...Array(30).fill(150), 151, 149, null]));
    expect(tone.issues).toEqual([]);
    expect(tone.frequencyHz).toBe(150);
    expect(tone.stableFrames).toBe(32);
  });
  it('refuses a frequency for noise, a short blow or a changing tone', () => {
    expect(steadyTone(frames(Array(40).fill(null))).frequencyHz).toBeNull();
    expect(steadyTone(frames(Array(6).fill(150))).issues).toContain('TOO_FEW_SAMPLES');
    const glide = steadyTone(frames(Array.from({ length: 40 }, (_, i) => 120 + i * 3)));
    expect(glide.issues).toContain('UNSTABLE_TONE');
    expect(glide.frequencyHz).toBeNull();
  });
  it('an interrupted capture cannot produce a frequency', () => {
    const tone = steadyTone(frames(Array(30).fill(150)), true);
    expect(tone.frequencyHz).toBeNull();
    expect(tone.issues).toContain('INTERRUPTED');
  });
});
describe('bottle discovery', () => {
  it('prefers f = a/√V for Helmholtz-like data and ignores the reference speed of sound', () => {
    const result = compareBottle(createBottleDemo().map((t) => ({ ...t })));
    expect(result.status).toBe('compared');
    expect(result.bestModel).toBe('inverse-sqrt');
    expect(result.distinctVolumes).toBe(5);
    expect(result.inverseFit!.slope).toBeGreaterThan(0);
  });
  it('recovers a linear law when the data are linear', () => {
    const linear = [0, 300, 600, 900, 1100].flatMap((w) =>
      [0, 1].map(() => trial(w, 400 - 0.2 * (1500 - w))),
    );
    expect(compareBottle(linear).bestModel).toBe('linear');
  });
  it('needs five volumes and a 2× range before choosing', () => {
    expect(compareBottle([0, 300, 600].map((w) => trial(w, 150))).status).toBe('insufficient');
    const narrow = [0, 100, 200, 300, 400].map((w) => trial(w, 100 + w / 10));
    expect(compareBottle(narrow).status).toBe('narrow-range');
  });
  it('holds out all repeats of one volume together', () => {
    const points = [1, 1, 2, 2, 3, 4, 5].map((x, i) => ({ id: String(i), x, y: x }));
    const result = compareModels(points, ['linear'] as const, {
      minConditions: 5,
      minRatio: 2,
      minMargin: 0,
    });
    expect(result.conditions).toBe(5);
    expect(result.fits[0].cvRmse).toBeCloseTo(0);
  });
  it('rejects mixed sources and tone/provenance mismatch', () => {
    expect(() => compareBottle([trial(0, 100), trial(300, 110, 'simulation')])).toThrow();
    expect(bottleTrialSchema.safeParse({ ...trial(0, 100), provenance: 'live' }).success).toBe(
      false,
    );
  });
  it('rejects water that leaves no air and keeps SI volumes', () => {
    const t = trial(0, 100);
    expect(airVolume(t.input)).toBeCloseTo(1.5e-3);
    expect(
      bottleTrialSchema.safeParse({ ...t, input: { ...t.input, waterM3: 1.5e-3 } }).success,
    ).toBe(false);
  });
  it('validates a saved investigation with analysis references', () => {
    const trials = createBottleDemo();
    const now = new Date().toISOString();
    const doc = {
      schemaVersion: 2,
      scenarioId: 'bottle-01',
      scenarioVersion: 1,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      provenance: 'simulation',
      hypothesis: 'Станет выше',
      hypothesisAt: now,
      conclusion: '',
      trials,
      selectionEvents: [],
      analyses: [
        {
          id: crypto.randomUUID(),
          at: now,
          revision: 1,
          conclusion: '',
          selectionEventIds: [],
          result: compareBottle(trials),
        },
      ],
    };
    expect(bottleInvestigationSchema.safeParse(doc).success).toBe(true);
    expect(bottleInvestigationSchema.safeParse({ ...doc, provenance: 'manual' }).success).toBe(
      false,
    );
  });
});
