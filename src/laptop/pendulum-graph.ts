import type { Crossing, PendulumPeriod, ProcessedPoint } from "../pendulum";

export class PendulumGraph {
  constructor(private canvas: HTMLCanvasElement) {}

  draw(
    points: ProcessedPoint[],
    periods: PendulumPeriod[],
    crossings: Crossing[],
  ) {
    const c = this.canvas,
      w = c.clientWidth,
      h = 250,
      dpr = Math.min(devicePixelRatio, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const end = points.at(-1)?.timestamp ?? 0,
      start = end - 15000,
      visible = points.filter(
        (p) => p.timestamp >= start && p.timestamp <= end && p.value !== null,
      );
    const max = Math.max(1, ...visible.map((p) => Math.abs(p.value!))) * 1.1,
      left = 54,
      top = 30,
      plotH = 180,
      plotW = Math.max(1, w - left - 14);
    const xAt = (t: number) => left + ((t - start) / 15000) * plotW;
    ctx.font = "11px monospace";
    ctx.strokeStyle = "#d4d8dc";
    ctx.fillStyle = "#47515b";
    for (const f of [-1, 0, 1]) {
      const y = top + ((1 - f) / 2) * plotH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(w - 14, y);
      ctx.stroke();
      ctx.fillText((f * max).toFixed(1), 2, y + 4);
    }
    ctx.fillText("−15 s", left, h - 5);
    ctx.fillText("0 s", w - 38, h - 5);
    // Shade complete, same-phase intervals and label both crossings that define each period.
    periods.forEach((period, i) => {
      if (period.endTimestamp < start || period.startTimestamp > end) return;
      const x1 = xAt(period.startTimestamp),
        x2 = xAt(period.endTimestamp);
      ctx.fillStyle = "rgba(241,90,10,.09)";
      ctx.fillRect(
        Math.max(left, x1),
        top,
        Math.max(0, Math.min(w - 14, x2) - Math.max(left, x1)),
        plotH,
      );
      ctx.strokeStyle = "#f15a0a";
      ctx.setLineDash([4, 4]);
      for (const x of [x1, x2])
        if (x >= left && x <= w - 14) {
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + plotH);
          ctx.stroke();
        }
      ctx.setLineDash([]);
      ctx.fillStyle = "#c74700";
      ctx.fillText(`T${i + 1}`, (x1 + x2) / 2 - 8, top - 12);
    });
    // Crossings without a complete period are still useful for diagnosis.
    for (const crossing of crossings) {
      if (crossing.timestamp < start || crossing.timestamp > end) continue;
      const x = xAt(crossing.timestamp);
      ctx.strokeStyle = "#a6a0b4";
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#176fe5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let connected = false,
      last = 0;
    for (const p of visible) {
      const x = xAt(p.timestamp),
        y = top + ((1 - p.value! / max) / 2) * plotH;
      if (connected && p.timestamp - last < 500) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      connected = true;
      last = p.timestamp;
    }
    ctx.stroke();
    ctx.fillStyle = "#176fe5";
    ctx.fillText("Угловая скорость по главной оси (°/с)", left, 14);
  }
}
