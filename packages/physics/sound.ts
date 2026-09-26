import type { SpectrumFrame, SoundAnalysis } from '../contracts';
export function median(values: number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function rmsDb(samples: Float32Array): number | null {
  if (!samples.length) return null;
  let sum = 0;
  for (const n of samples) {
    if (!Number.isFinite(n)) return null;
    sum += n * n;
  }
  return sum === 0 ? null : 20 * Math.log10(Math.sqrt(sum / samples.length));
}
/** Dominant spectral component, not a voice fundamental estimator. */
export function dominantPeak(
  bins: Float32Array,
  fs: number,
  fftSize: number,
): { hz: number | null; prominence: number | null } {
  if (fs <= 0 || fftSize <= 0) return { hz: null, prominence: null };
  const start = Math.max(1, Math.ceil((70 * fftSize) / fs)),
    end = Math.min(bins.length, Math.floor((8000 * fftSize) / fs) + 1);
  let index = -1,
    peak = -Infinity;
  const floor: number[] = [];
  for (let i = start; i < end; i++) {
    const v = bins[i];
    if (Number.isFinite(v)) {
      floor.push(v);
      if (v > peak) {
        peak = v;
        index = i;
      }
    }
  }
  const background = median(floor);
  if (index < 0 || background === null) return { hz: null, prominence: null };
  const prominence = peak - background;
  return { hz: peak > -70 && prominence >= 12 ? (index * fs) / fftSize : null, prominence };
}
/** Preserve maximum per display bucket. These are display values, not averaged power. */
export function displayBins(bins: Float32Array, count = 128, end = bins.length): number[] {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.floor((i * end) / count),
      b = Math.max(a + 1, Math.floor(((i + 1) * end) / count));
    let max = -100;
    for (let j = a; j < Math.min(b, bins.length); j++)
      if (Number.isFinite(bins[j])) max = Math.max(max, bins[j]);
    return Math.min(0, max);
  });
}
export function analyzeSound(
  frames: SpectrumFrame[],
  interrupted = false,
  simulation = false,
  clipped = false,
): SoundAnalysis {
  const duration = frames.length ? frames.at(-1)!.t : 0;
  const peaks = frames.map((f) => f.peakHz).filter((n): n is number => n !== null);
  const reasons: SoundAnalysis['quality']['reasons'] = [];
  if (duration < 2) reasons.push('TOO_SHORT');
  if (peaks.length < frames.length * 0.3 || !peaks.length) reasons.push('NO_STABLE_TONE');
  if (interrupted) reasons.push('INTERRUPTED');
  if (clipped) reasons.push('CLIPPING');
  if (simulation) reasons.push('DEMO_DATA');
  const levels = frames.map((f) => f.rmsDb).filter((n): n is number => n !== null);
  const power = levels.length
    ? levels.reduce((s, db) => s + 10 ** (db / 10), 0) / levels.length
    : 0;
  const invalid = duration < 2 || interrupted;
  return {
    algorithmVersion: 'sound-v0.1',
    peakHz: invalid ? null : median(peaks),
    averageDb: power > 0 ? 10 * Math.log10(power) : null,
    duration,
    quality: { status: invalid ? 'invalid' : reasons.length ? 'warning' : 'valid', reasons },
  };
}
