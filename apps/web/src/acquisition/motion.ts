import type { MotionSample, Vec3 } from '../../../../packages/contracts';
export type MotionReport = {
  acceleration: boolean;
  rotation: boolean;
  hz: number;
  sample: MotionSample | null;
  count: number;
};
function vector(v: DeviceMotionEventAcceleration | null): Vec3 | null {
  return v && [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n))
    ? { x: v.x!, y: v.y!, z: v.z! }
    : null;
}
/** Must be the first await inside a user gesture: iOS only grants motion access from a tap. */
async function requestMotionAccess() {
  if (!window.isSecureContext) throw new Error('Для датчиков нужен HTTPS или localhost.');
  if (typeof DeviceMotionEvent === 'undefined')
    throw new Error('Этот браузер не предоставляет датчики движения.');
  const api = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<string>;
  };
  if (api.requestPermission && (await api.requestPermission()) !== 'granted')
    throw new Error('Доступ к движению отклонён. Разрешение можно изменить в настройках браузера.');
}
function toSample(event: DeviceMotionEvent, first: number): MotionSample {
  const r = event.rotationRate;
  return {
    t: event.timeStamp / 1000 - first,
    accelerationWithGravity: vector(event.accelerationIncludingGravity),
    rotationRate:
      r && [r.alpha, r.beta, r.gamma].every((n) => typeof n === 'number' && Number.isFinite(n))
        ? { alpha: r.alpha!, beta: r.beta!, gamma: r.gamma! }
        : null,
  };
}
export type MotionRecording = { stop: () => void; reportedIntervalMs: () => number | null };
/**
 * Streams devicemotion samples with event timestamps (s from the first event). Stops at the
 * sample or duration limit, on abort, and when stop() is called; the listener is always removed.
 */
export async function recordMotion(
  signal: AbortSignal,
  onSample: (sample: MotionSample) => void,
  onLimit: () => void,
  limits = { seconds: 60, samples: 12000 },
): Promise<MotionRecording> {
  await requestMotionAccess();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  let first: number | null = null,
    last = -Infinity,
    count = 0,
    stopped = false;
  const intervals: number[] = [];
  const listener = (event: DeviceMotionEvent) => {
    if (stopped) return;
    const t = event.timeStamp / 1000;
    if (t <= last) return;
    last = t;
    first ??= t;
    if (typeof event.interval === 'number' && event.interval > 0 && intervals.length < 500)
      intervals.push(event.interval);
    onSample(toSample(event, first));
    if (++count >= limits.samples || t - first >= limits.seconds) {
      stop();
      onLimit();
    }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener('devicemotion', listener);
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  window.addEventListener('devicemotion', listener);
  return {
    stop,
    reportedIntervalMs: () => {
      if (!intervals.length) return null;
      const sorted = [...intervals].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    },
  };
}
export async function diagnoseMotion(
  signal: AbortSignal,
  onUpdate: (report: MotionReport) => void,
): Promise<MotionReport> {
  await requestMotionAccess();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  return new Promise((resolve, reject) => {
    let first: number | null = null,
      last = 0;
    let report: MotionReport = {
      acceleration: false,
      rotation: false,
      hz: 0,
      sample: null,
      count: 0,
    };
    const listener = (event: DeviceMotionEvent) => {
      const t = event.timeStamp / 1000;
      if (first === null) first = t;
      if (t < last) return;
      last = t;
      const r = event.rotationRate;
      const rotation =
        r && [r.alpha, r.beta, r.gamma].every((n) => typeof n === 'number' && Number.isFinite(n))
          ? { alpha: r.alpha!, beta: r.beta!, gamma: r.gamma! }
          : null;
      const acceleration = vector(event.accelerationIncludingGravity);
      report = {
        acceleration: report.acceleration || !!acceleration,
        rotation: report.rotation || !!rotation,
        count: report.count + 1,
        hz: t > first ? report.count / (t - first) : 0,
        sample: { t: t - first, accelerationWithGravity: acceleration, rotationRate: rotation },
      };
      onUpdate(report);
    };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('devicemotion', listener);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(report);
    }, 4000);
    signal.addEventListener('abort', abort, { once: true });
    window.addEventListener('devicemotion', listener);
    onUpdate(report);
  });
}
