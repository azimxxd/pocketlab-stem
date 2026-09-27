import { estimatePitch } from "./analysis";

self.onmessage = ({ data }) => {
  const { samples, spectrum, sampleRate, timestamp, sequence, maxFrequency } = data;
  let energy = 0;
  for (const x of samples as Float32Array) energy += x * x;
  const level = Math.max(-120, Math.min(0, 10 * Math.log10(energy / samples.length || 1e-12)));
  // A contiguous 256-sample preview preserves the waveform's time axis.
  self.postMessage({ sequence, timestamp, sampleRate, maxFrequency,
    waveform: Array.from((samples as Float32Array).slice(0, 256), x => Math.max(-1, Math.min(1, x))),
    spectrum, level, pitch: estimatePitch(samples, sampleRate) });
};
