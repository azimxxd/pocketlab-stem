import { axes, groups, type SensorSample } from "./contracts";
export function sampleRate(samples: SensorSample[]): number | null {
  // Motion and orientation have separate event clocks; never add their rates together.
  const motion = samples.filter((s) => s.source === "motion");
  const stream =
    motion.length >= 2
      ? motion
      : samples.filter((s) => s.source === "orientation");
  if (stream.length < 2) return null;
  const dt = stream.at(-1)!.timestamp - stream[0].timestamp;
  return dt > 0 ? ((stream.length - 1) * 1000) / dt : null;
}
export class PacketOrder {
  last = -1;
  missing = 0;
  outOfOrder = 0;
  received = 0;
  accept(s: SensorSample) {
    this.received++;
    if (s.sequence <= this.last) {
      this.outOfOrder++;
      return false;
    }
    if (this.last >= 0) this.missing += s.sequence - this.last - 1;
    this.last = s.sequence;
    return true;
  }
}
export class SensorBuffer {
  samples: SensorSample[] = [];
  add(s: SensorSample) {
    this.samples.push(s);
    const cutoff = s.timestamp - 15_000;
    while (
      this.samples.length &&
      (this.samples[0].timestamp < cutoff || this.samples.length > 12000)
    )
      this.samples.shift();
  }
}
export type Stats = {
  count: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
};
export function stats(values: (number | null)[]): Stats {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length)
    return { count: 0, mean: null, sd: null, min: null, max: null };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return {
    count: v.length,
    mean,
    sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length),
    min: Math.min(...v),
    max: Math.max(...v),
  };
}
export type Calibration = {
  durationMs: number;
  rate: number | null;
  channels: Record<string, Stats>;
  stable: boolean;
  reason: string;
};
export function calibrate(samples: SensorSample[]): Calibration {
  const motion = samples.filter((s) => s.source === "motion");
  const channels: Record<string, Stats> = {};
  for (const g of groups)
    for (const a of axes[g]) {
      const relevant =
        g === "orientation"
          ? samples.filter((s) => s.source === "orientation")
          : motion;
      channels[`${g}.${a}`] = stats(
        relevant.map((s) => (s[g] as Record<string, number | null>)[a]),
      );
    }
  const durationMs = samples.length
    ? samples.at(-1)!.timestamp - samples[0].timestamp
    : 0;
  const usable = Object.entries(channels).some(
    ([key, v]) => !key.startsWith("orientation") && v.count >= 10,
  );
  const moving = Object.entries(channels).some(([key, v]) => {
    if (v.mean === null || v.sd === null) return false;
    if (key.startsWith("rotationRate")) return Math.abs(v.mean) > 5 || v.sd > 2;
    if (key.startsWith("acceleration"))
      return (
        v.sd > 0.35 ||
        (key.startsWith("acceleration.") && Math.abs(v.mean) > 0.8)
      );
    return false;
  });
  const stable = durationMs >= 2400 && usable && !moving;
  return {
    durationMs,
    rate: sampleRate(motion),
    channels,
    stable,
    reason: !usable
      ? "Нет достаточных данных акселерометра/гироскопа."
      : moving
        ? "Телефон двигается. Оставьте его неподвижным для калибровки."
        : durationMs < 2400
          ? "Недостаточно данных для калибровки."
          : "Готово. Отведите маятник и отпустите его.",
  };
}
export class MotionStartDetector {
  private first: number | null = null;
  constructor(private calibration: Calibration) {}
  update(s: SensorSample): boolean {
    if (s.source !== "motion") return false;
    let exceeds = false;
    for (const g of [
      "rotationRate",
      "acceleration",
      "accelerationIncludingGravity",
    ] as const) {
      let energy = 0,
        noise = 0,
        count = 0;
      for (const a of axes[g]) {
        const v = (s[g] as Record<string, number | null>)[a],
          c = this.calibration.channels[`${g}.${a}`];
        if (v === null || c?.mean == null || c.sd === null) continue;
        energy += (v - c.mean) ** 2;
        noise += c.sd ** 2;
        count++;
      }
      if (
        count &&
        Math.sqrt(energy) >
          Math.max(g === "rotationRate" ? 6 : 0.65, 6 * Math.sqrt(noise))
      )
        exceeds = true;
    }
    if (!exceeds) {
      this.first = null;
      return false;
    }
    this.first ??= s.timestamp;
    return s.timestamp - this.first >= 80;
  }
}
export class RecordingSession {
  samples: SensorSample[] = [];
  startedAt = new Date().toISOString();
  endedAt: string | null = null;
  stopReason: string | null = null;
  constructor(
    public session: string,
    public calibration: Calibration,
    public userAgent: string,
  ) {}
  add(s: SensorSample) {
    if (!this.endedAt) this.samples.push(s);
  }
  stop(reason: string) {
    this.endedAt ??= new Date().toISOString();
    this.stopReason ??= reason;
  }
  export() {
    const missingChannels: string[] = [],
      partiallyMissingChannels: string[] = [];
    for (const g of groups)
      for (const a of axes[g]) {
        const applicable = this.samples.filter((s) =>
          g === "orientation"
            ? s.source === "orientation"
            : s.source === "motion",
        );
        const count = applicable.filter(
          (s) => (s[g] as Record<string, number | null>)[a] === null,
        ).length;
        if (!applicable.length || count === applicable.length)
          missingChannels.push(`${g}.${a}`);
        else if (count) partiallyMissingChannels.push(`${g}.${a}`);
      }
    return {
      version: 2,
      session: this.session,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      stopReason: this.stopReason,
      sampleCount: this.samples.length,
      observedSampleRate: sampleRate(this.samples),
      missingChannels,
      partiallyMissingChannels,
      userAgent: this.userAgent,
      timestampBasis:
        "phone performance.timeOrigin + event.timeStamp (milliseconds); separate orientation events",
      units: {
        acceleration: "m/s²",
        accelerationIncludingGravity: "m/s²",
        rotationRate: "deg/s",
        orientation: "deg",
      },
      calibration: this.calibration,
      samples: this.samples,
    };
  }
}
