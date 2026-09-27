import { finite, nullAngles, nullXYZ, type SensorSample } from "../contracts";
type PermissionConstructor = { requestPermission?: () => Promise<string> };
export function acquisitionTime(event: Event) {
  // Modern browsers use a monotonic timestamp relative to timeOrigin; older WebKit used epoch milliseconds.
  return event.timeStamp > 1e12
    ? event.timeStamp
    : performance.timeOrigin + event.timeStamp;
}
export class SensorManager {
  sequence = 0;
  private attached = false;
  private orientation: SensorSample["orientation"] = nullAngles();
  private orientationTimestamp: number | null = null;
  constructor(private emit: (s: SensorSample) => void) {}
  async enable(): Promise<string> {
    if (!window.isSecureContext)
      throw new Error(
        "Нужен HTTPS с доверенным сертификатом. Откройте HTTPS-адрес.",
      );
    const motion = window.DeviceMotionEvent as unknown as
      PermissionConstructor | undefined;
    const orientation = window.DeviceOrientationEvent as unknown as
      PermissionConstructor | undefined;
    if (!motion && !orientation)
      throw new Error("Этот браузер не поддерживает датчики движения.");
    // Invoke both before awaiting so iOS sees the same explicit user gesture.
    const results = await Promise.allSettled([
      motion?.requestPermission
        ? motion.requestPermission()
        : Promise.resolve(motion ? "granted" : "unavailable"),
      orientation?.requestPermission
        ? orientation.requestPermission()
        : Promise.resolve(orientation ? "granted" : "unavailable"),
    ]);
    const permission = results.map((r) =>
      r.status === "fulfilled" ? r.value : "denied",
    );
    this.stop();
    if (permission[0] === "granted")
      window.addEventListener("devicemotion", this.motion);
    if (permission[1] === "granted")
      window.addEventListener("deviceorientation", this.orient);
    this.attached = true;
    if (!permission.includes("granted"))
      throw new Error(
        "Доступ к датчикам запрещён. Разрешите его в настройках сайта и повторите.",
      );
    return `Движение: ${permission[0]}; ориентация: ${permission[1]}. Ожидание реальных событий…`;
  }
  private base(e: Event, source: SensorSample["source"]): SensorSample {
    const timestamp = acquisitionTime(e);
    const fresh =
      this.orientationTimestamp !== null &&
      timestamp - this.orientationTimestamp < 1000;
    return {
      sequence: this.sequence++,
      timestamp,
      source,
      acceleration: nullXYZ(),
      accelerationIncludingGravity: nullXYZ(),
      rotationRate: nullAngles(),
      orientation: fresh ? { ...this.orientation } : nullAngles(),
      orientationTimestamp: fresh ? this.orientationTimestamp : null,
      screenAngle: finite(
        screen.orientation?.angle ??
          (window as unknown as { orientation?: number }).orientation,
      ),
    };
  }
  private motion = (e: DeviceMotionEvent) => {
    const s = this.base(e, "motion");
    for (const group of [
      "acceleration",
      "accelerationIncludingGravity",
    ] as const)
      s[group] = {
        x: finite(e[group]?.x),
        y: finite(e[group]?.y),
        z: finite(e[group]?.z),
      };
    s.rotationRate = {
      alpha: finite(e.rotationRate?.alpha),
      beta: finite(e.rotationRate?.beta),
      gamma: finite(e.rotationRate?.gamma),
    };
    this.emit(s);
  };
  private orient = (e: DeviceOrientationEvent) => {
    this.orientation = {
      alpha: finite(e.alpha),
      beta: finite(e.beta),
      gamma: finite(e.gamma),
      absolute: e.absolute,
    };
    this.orientationTimestamp = acquisitionTime(e);
    this.emit(this.base(e, "orientation"));
  };
  stop() {
    if (this.attached) {
      window.removeEventListener("devicemotion", this.motion);
      window.removeEventListener("deviceorientation", this.orient);
    }
    this.attached = false;
    this.orientation = nullAngles();
    this.orientationTimestamp = null;
  }
}
