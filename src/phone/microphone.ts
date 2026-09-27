import type { SoundFrame } from "../sound/contracts";

export class MicrophoneSource {
  private context?: AudioContext;
  private stream?: MediaStream;
  private analyser?: AnalyserNode;
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private busy = false;
  private sequence = 0;
  ready = false;
  constructor(private frame: (frame: SoundFrame) => void, private interrupted: (reason: string) => void) {}

  async enable() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
      throw new Error("Микрофон недоступен. Откройте страницу в браузере через HTTPS.");
    this.stop();
    const generation = this.generation;
    try {
      // Call getUserMedia before awaiting anything so it remains tied to the permission-button gesture.
      const permission = navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } });
      const context = this.context = new AudioContext();
      const resume = context.resume();
      const stream = await permission;
      await resume;
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const analyser = this.analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      // Web Audio's FFT uses a Blackman window; no assumed microphone sample rate.
      context.createMediaStreamSource(stream).connect(analyser);
      this.worker = new Worker(new URL("../sound/analysis-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => { this.busy = false; this.frame(data); };
      this.worker.onerror = () => this.interrupted("Не удалось обработать звук. Разрешите микрофон снова.");
      for (const track of stream.getTracks()) track.onended = () => this.interrupted("Микрофон отключён. Разрешите микрофон снова.");
      context.onstatechange = () => {
        if (this.ready && context.state !== "running") this.interrupted("Микрофон приостановлен. Разрешите микрофон снова.");
      };
      this.ready = true;
    } catch (error) {
      this.stop();
      const name = (error as Error).name;
      throw new Error(name === "NotAllowedError" ? "Доступ к микрофону запрещён. Разрешите его в настройках браузера."
        : name === "NotFoundError" ? "Микрофон не найден." : "Не удалось включить микрофон. Проверьте разрешение и повторите.");
    }
  }

  measure(enabled: boolean) {
    clearInterval(this.timer);
    if (!enabled || !this.ready) return;
    this.timer = setInterval(() => {
      if (this.busy || !this.analyser || !this.context || !this.worker) return;
      const samples = new Float32Array(this.analyser.fftSize);
      const frequencies = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatTimeDomainData(samples);
      this.analyser.getFloatFrequencyData(frequencies);
      const sampleRate = this.context.sampleRate, maxFrequency = Math.min(8000, sampleRate / 2);
      const bins = Math.floor(maxFrequency / (sampleRate / this.analyser.fftSize));
      const spectrum = Array.from({ length: 128 }, (_, i) => {
        let power = 0, count = 0;
        for (let k = Math.floor(i * bins / 128); k < Math.floor((i + 1) * bins / 128); k++) {
          power += 10 ** (frequencies[k] / 10); count++;
        }
        return Math.max(-120, Math.min(0, 10 * Math.log10(power / (count || 1) || 1e-12)));
      });
      this.busy = true;
      this.worker.postMessage({ samples, spectrum, sampleRate, maxFrequency, timestamp: performance.now(), sequence: this.sequence++ });
    }, 50);
  }

  stop() {
    this.generation++;
    this.ready = false;
    this.measure(false);
    this.worker?.terminate(); this.worker = undefined; this.busy = false;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    this.stream = undefined;
    if (this.context) { this.context.onstatechange = null; void this.context.close(); }
    this.context = undefined; this.analyser = undefined;
  }
}
