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
export async function diagnoseMotion(
  signal: AbortSignal,
  onUpdate: (report: MotionReport) => void,
): Promise<MotionReport> {
  if (!window.isSecureContext) throw new Error('Для датчиков нужен HTTPS или localhost.');
  if (typeof DeviceMotionEvent === 'undefined')
    throw new Error('Этот браузер не предоставляет датчики движения.');
  const api = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<string>;
  };
  if (api.requestPermission && (await api.requestPermission()) !== 'granted')
    throw new Error('Доступ к движению отклонён. Разрешение можно изменить в настройках браузера.');
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
