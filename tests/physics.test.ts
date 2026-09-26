import { describe, it, expect } from 'vitest';
import { analyzeSound, dominantPeak, rmsDb, displayBins } from '../packages/physics/sound';
import { investigationSchema } from '../packages/contracts';
const frame = (t: number, hz: number | null = 440, db: number | null = -20) => ({
  t,
  peakHz: hz,
  rmsDb: db,
  peakProminenceDb: 20,
  bins: [-90, -20, -90],
});
describe('sound analysis', () => {
  for (const fs of [44100, 48000])
    for (const hz of [440, 1000])
      it(`finds a spectral maximum at ${hz} Hz / ${fs}`, () => {
        const bins = new Float32Array(2048).fill(-95);
        bins[Math.round((hz * 4096) / fs)] = -20;
        expect(dominantPeak(bins, fs, 4096).hz).toBeCloseTo(
          (Math.round((hz * 4096) / fs) * fs) / 4096,
        );
      });
  it('does not invent a pitch for silence or flat noise', () => {
    expect(dominantPeak(new Float32Array(2048).fill(-Infinity), 48000, 4096).hz).toBeNull();
    expect(dominantPeak(new Float32Array(2048).fill(-30), 48000, 4096).hz).toBeNull();
  });
  it('uses RMS and represents silence as missing logarithmic level', () => {
    expect(rmsDb(new Float32Array([0.5, -0.5]))).toBeCloseTo(-6.0206);
    expect(rmsDb(new Float32Array(10))).toBeNull();
    expect(rmsDb(new Float32Array([NaN]))).toBeNull();
  });
  it('averages power, not dB', () => {
    const result = analyzeSound([frame(1, 440, -10), frame(3, 440, -30)]);
    expect(result.averageDb).toBeCloseTo(10 * Math.log10(0.0505));
  });
  it('short and interrupted captures cannot produce a trusted frequency', () => {
    expect(analyzeSound([frame(0.3)]).peakHz).toBeNull();
    const result = analyzeSound([frame(1), frame(3)], true);
    expect(result.quality.status).toBe('invalid');
    expect(result.peakHz).toBeNull();
  });
  it('retains simulation provenance as a quality note', () => {
    expect(analyzeSound([frame(1), frame(3)], false, true).quality.reasons).toContain('DEMO_DATA');
  });
  it('flags missing tone and clipping independently', () => {
    const result = analyzeSound([frame(1, null), frame(3, null)], false, false, true);
    expect(result.quality.reasons).toContain('NO_STABLE_TONE');
    expect(result.quality.reasons).toContain('CLIPPING');
  });
  it('keeps display bins finite', () => {
    expect(displayBins(new Float32Array(2048).fill(-Infinity)).every(Number.isFinite)).toBe(true);
  });
  it('rejects invalid imported record shape', () => {
    expect(investigationSchema.safeParse({ schemaVersion: 1, frames: [{ t: NaN }] }).success).toBe(
      false,
    );
  });
});
