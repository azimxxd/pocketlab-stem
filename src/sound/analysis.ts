// YIN cumulative mean normalized difference. A spectral harmonic is not pitch.
export function estimatePitch(samples: Float32Array, sampleRate: number): number | null {
  const min = Math.floor(sampleRate / 1600), max = Math.min(Math.ceil(sampleRate / 60), samples.length >> 1);
  const size = samples.length - max;
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  if (energy / samples.length < 0.00001) return null;
  const difference = new Float64Array(max + 1);
  let sum = 0;
  for (let lag = 1; lag <= max; lag++) {
    let d = 0;
    for (let i = 0; i < size; i++) d += (samples[i] - samples[i + lag]) ** 2;
    sum += d;
    difference[lag] = sum ? d * lag / sum : 1;
  }
  for (let lag = Math.max(2, min); lag < max; lag++) {
    if (difference[lag] >= 0.12) continue;
    while (lag < max - 1 && difference[lag + 1] < difference[lag]) lag++;
    const a = difference[lag - 1], b = difference[lag], c = difference[lag + 1];
    const offset = (a - c) / (2 * (a - 2 * b + c)) || 0;
    const pitch = sampleRate / (lag + offset);
    return pitch >= 60 && pitch <= 1600 ? pitch : null;
  }
  return null;
}
