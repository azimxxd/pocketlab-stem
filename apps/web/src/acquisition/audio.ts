import { dominantPeak, displayBins, rmsDb } from '../../../../packages/physics/sound';
import type { SpectrumFrame } from '../../../../packages/contracts';
export type AudioSession = {
  stop: () => void;
  setTone: (frequency: number) => void;
  sampleRate: number;
  fftSize: number;
  frequencyMax: number;
  settings: Record<string, string | number | boolean>;
};
export async function startAudio(
  mode: 'live' | 'simulation',
  onFrame: (frame: SpectrumFrame) => void,
  onEnded: () => void,
  onClip: () => void,
  signal: AbortSignal,
): Promise<AudioSession> {
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  let oscillator: OscillatorNode | undefined;
  let timer: number | undefined;
  let stopped = false;
  const nodes: AudioNode[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    try {
      oscillator?.stop();
    } catch {}
    nodes.forEach((n) => n.disconnect());
    void context.close();
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    await context.resume();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    nodes.push(analyser);
    let settings: Record<string, string | number | boolean> = {};
    if (mode === 'live') {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Микрофон недоступен. Открой приложение по HTTPS или на localhost.');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (signal.aborted) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException('Cancelled', 'AbortError');
      }
      const source = context.createMediaStreamSource(stream);
      nodes.push(source);
      source.connect(analyser);
      const raw = stream.getAudioTracks()[0].getSettings();
      for (const k of [
        'sampleRate',
        'echoCancellation',
        'noiseSuppression',
        'autoGainControl',
      ] as const) {
        const v = raw[k];
        if (v !== undefined) settings[k] = v;
      }
      stream.getTracks().forEach((t) =>
        t.addEventListener(
          'ended',
          () => {
            stop();
            onEnded();
          },
          { once: true },
        ),
      );
    } else {
      oscillator = context.createOscillator();
      oscillator.frequency.value = 440;
      const volume = context.createGain();
      volume.gain.value = 0.2;
      const silent = context.createGain();
      silent.gain.value = 0;
      nodes.push(oscillator, volume, silent);
      oscillator.connect(volume).connect(analyser).connect(silent).connect(context.destination);
      oscillator.start();
      settings = { generator: 'sine', frequencyHz: 440 };
    }
    const frequency = new Float32Array(analyser.frequencyBinCount);
    const wave = new Float32Array(analyser.fftSize);
    const begin = context.currentTime;
    const frequencyMax = Math.min(8000, context.sampleRate / 2);
    let clippingFrames = 0;
    timer = window.setInterval(() => {
      if (stopped) return;
      if (context.state !== 'running') {
        stop();
        onEnded();
        return;
      }
      analyser.getFloatFrequencyData(frequency);
      analyser.getFloatTimeDomainData(wave);
      const peak = dominantPeak(frequency, context.sampleRate, analyser.fftSize);
      if (wave.some((n) => Math.abs(n) >= 0.999)) clippingFrames++;
      if (clippingFrames === 3) {
        onClip();
        clippingFrames++;
      }
      onFrame({
        t: context.currentTime - begin,
        peakHz: peak.hz,
        rmsDb: rmsDb(wave),
        peakProminenceDb: peak.prominence,
        bins: displayBins(
          frequency,
          128,
          Math.floor((frequencyMax * analyser.fftSize) / context.sampleRate),
        ),
      });
    }, 50);
    return {
      stop,
      setTone: (hz) => {
        if (oscillator) oscillator.frequency.setValueAtTime(hz, context.currentTime);
      },
      sampleRate: context.sampleRate,
      fftSize: analyser.fftSize,
      frequencyMax,
      settings,
    };
  } catch (e) {
    stop();
    throw e;
  }
}
