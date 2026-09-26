import { useEffect, useRef } from 'react';
import type { MotionSample } from '../../../../packages/contracts';
import { bodyRate, norm } from '../../../../packages/physics/motion';
type Series = { label: string; color: string; value: (s: MotionSample) => number | null };
const kinds: Record<
  'acceleration' | 'rotation',
  { title: string; unit: string; floor: number; series: Series[] }
> = {
  acceleration: {
    title: 'Ускорение с гравитацией',
    unit: 'м/с²',
    floor: 12,
    series: [
      { label: 'x', color: '#ff9f8a', value: (s) => s.accelerationWithGravity?.x ?? null },
      { label: 'y', color: '#c2f77e', value: (s) => s.accelerationWithGravity?.y ?? null },
      { label: 'z', color: '#86bbff', value: (s) => s.accelerationWithGravity?.z ?? null },
      {
        label: '|a|',
        color: '#f4f1de',
        value: (s) => (s.accelerationWithGravity ? norm(s.accelerationWithGravity) : null),
      },
    ],
  },
  rotation: {
    title: 'Угловая скорость',
    unit: '°/с',
    floor: 30,
    series: [
      { label: 'ωx', color: '#ff9f8a', value: (s) => bodyRate(s)?.x ?? null },
      { label: 'ωy', color: '#c2f77e', value: (s) => bodyRate(s)?.y ?? null },
      { label: 'ωz', color: '#86bbff', value: (s) => bodyRate(s)?.z ?? null },
    ],
  },
};
/** Time series on a canvas. Missing values break the line; still intervals are shaded. */
export function MotionChart({
  kind,
  samples,
  from,
  to,
  cursor,
  still = [],
}: {
  kind: 'acceleration' | 'rotation';
  samples: MotionSample[];
  from: number;
  to: number;
  cursor?: number;
  still?: { startS: number; endS: number }[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const spec = kinds[kind];
  const visible = samples.filter((s) => s.t >= from && s.t <= to);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width,
      h = canvas.height,
      left = 46,
      pad = 12;
    const range =
      Math.max(
        spec.floor,
        ...visible.flatMap((s) => spec.series.map((line) => Math.abs(line.value(s) ?? 0))),
      ) * 1.1;
    const x = (t: number) => left + ((t - from) / Math.max(1e-6, to - from)) * (w - left - pad);
    const y = (v: number) => h / 2 - (v / range) * (h / 2 - pad);
    ctx.fillStyle = '#102c2b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff0d';
    for (const st of still)
      if (st.endS >= from && st.startS <= to)
        ctx.fillRect(
          x(Math.max(from, st.startS)),
          0,
          x(Math.min(to, st.endS)) - x(Math.max(from, st.startS)),
          h,
        );
    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#9fb5ae';
    ctx.strokeStyle = '#ffffff14';
    ctx.lineWidth = 1;
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(left, y(f * range));
      ctx.lineTo(w - pad, y(f * range));
      ctx.stroke();
      ctx.fillText(String(Math.round(f * range)), 2, y(f * range) + 6);
    }
    for (const line of spec.series) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.label === '|a|' ? 3 : 2;
      ctx.beginPath();
      let pen = false;
      for (const s of visible) {
        const v = line.value(s);
        if (v === null) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(x(s.t), y(v));
        else ctx.moveTo(x(s.t), y(v));
        pen = true;
      }
      ctx.stroke();
    }
    if (cursor !== undefined) {
      ctx.strokeStyle = '#ffffff99';
      ctx.beginPath();
      ctx.moveTo(x(cursor), 0);
      ctx.lineTo(x(cursor), h);
      ctx.stroke();
    }
  });
  return (
    <div className="motion-chart">
      <div className="plot-title">
        <span>
          {spec.title}, {spec.unit}
        </span>
        <span className="motion-legend">
          {spec.series.map((line) => (
            <span key={line.label}>
              <i style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </span>
      </div>
      <canvas
        ref={ref}
        width={1000}
        height={260}
        aria-label={`${spec.title} по осям телефона, ${spec.unit}, от ${from.toFixed(1)} до ${to.toFixed(1)} с. Числовые значения приведены под графиками.`}
      />
      <div className="x-axis">
        <span>{from.toFixed(1)} с</span>
        <span>{to.toFixed(1)} с</span>
      </div>
    </div>
  );
}
