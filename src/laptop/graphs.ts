import type { SensorSample } from "../contracts";
export class LiveGraph {
  constructor(
    private canvas: HTMLCanvasElement,
    private group: "acceleration" | "rotationRate",
  ) {}
  draw(samples: SensorSample[]) {
    const c = this.canvas,
      w = c.clientWidth,
      h = 180,
      dpr = Math.min(devicePixelRatio, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const stream = samples.filter((s) => s.source === "motion");
    const end = samples.at(-1)?.timestamp ?? 0,
      start = end - 15000;
    const keys =
      this.group === "acceleration"
        ? ["x", "y", "z"]
        : ["alpha", "beta", "gamma"];
    const values = stream
      .flatMap((s) =>
        keys.map((k) => (s[this.group] as Record<string, number | null>)[k]),
      )
      .filter((v): v is number => v !== null);
    const max = Math.max(
      this.group === "acceleration" ? 1 : 10,
      ...values.map(Math.abs),
    );
    const left = 48,
      top = 20,
      plotH = 130,
      plotW = Math.max(1, w - left - 10);
    ctx.font = "11px monospace";
    ctx.strokeStyle = "#d4d8dc";
    ctx.fillStyle = "#47515b";
    for (const f of [-1, 0, 1]) {
      const y = top + ((1 - f) / 2) * plotH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
      ctx.fillText((f * max).toFixed(1), 2, y + 4);
    }
    ctx.fillText("−15 s", left, h - 5);
    ctx.fillText("0 s", w - 32, h - 5);
    keys.forEach((key, i) => {
      ctx.strokeStyle = ["#c0392b", "#16813b", "#2464c8"][i];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let connected = false,
        last = 0;
      for (const s of stream) {
        const v = (s[this.group] as Record<string, number | null>)[key];
        if (v === null) {
          connected = false;
          continue;
        }
        const x = left + ((s.timestamp - start) / 15000) * plotW,
          y = top + ((1 - v / max) / 2) * plotH;
        if (connected && s.timestamp - last < 500) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        connected = true;
        last = s.timestamp;
      }
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(key, left + i * 80, 12);
    });
  }
}
