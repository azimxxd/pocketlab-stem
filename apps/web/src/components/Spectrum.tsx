import { useEffect, useRef } from 'react';
import type { SpectrumFrame } from '../../../../packages/contracts';
const palette = Array.from({ length: 65 }, (_, i) => {
  const power = i / 64;
  return `hsl(${170 - power * 95} ${40 + power * 50}% ${9 + power * 61}%)`;
});
export function Spectrum({
  frames,
  frequencyMax = 8000,
}: {
  frames: SpectrumFrame[];
  frequencyMax?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<{ count: number; last: SpectrumFrame | null }>({ count: 0, last: null });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width,
      h = canvas.height;
    // Live capture and replay only append frames: paint the new columns, not the whole history.
    const prev = drawn.current;
    const appended =
      prev.count > 0 && prev.count <= frames.length && frames[prev.count - 1] === prev.last;
    if (!appended) {
      ctx.fillStyle = '#102c2b';
      ctx.fillRect(0, 0, w, h);
    }
    for (let i = appended ? prev.count : 0; i < frames.length; i++) {
      const frame = frames[i];
      const x = (frame.t * w) / 15;
      if (x > w) break;
      const cell = Math.ceil(h / frame.bins.length);
      frame.bins.forEach((db, y) => {
        ctx.fillStyle = palette[Math.round(Math.max(0, Math.min(1, (db + 90) / 65)) * 64)];
        ctx.fillRect(x, h - ((y + 1) * h) / frame.bins.length, Math.ceil(w / 300), cell);
      });
    }
    drawn.current = { count: frames.length, last: frames.at(-1) ?? null };
  }, [frames]);
  const current = frames.at(-1);
  const path =
    current?.bins
      .map(
        (db, i) =>
          `${i === 0 ? 'M' : 'L'}${(i * 800) / 127},${100 - Math.max(0, Math.min(95, db + 100))}`,
      )
      .join(' ') ?? '';
  return (
    <div className="plot-stack">
      <div className="plot-title">
        <span>Спектрограмма</span>
        <span>Частота, Гц</span>
      </div>
      <div className="spectrogram">
        <div className="y-axis">
          <span>{Math.round(frequencyMax)}</span>
          <span>{Math.round(frequencyMax / 2)}</span>
          <span>0</span>
        </div>
        <canvas
          ref={ref}
          width={900}
          height={250}
          aria-label="Спектрограмма: частота звука по вертикали, время по горизонтали. Числовые показатели приведены под графиком."
        />
        <div className="plot-grid" aria-hidden="true" />
        {!frames.length && (
          <div className="plot-placeholder">
            <span className="wave-icon">∿</span>
            <b>Здесь появится твой звук</b>
            <span>Запусти микрофон или изучи демосигнал</span>
          </div>
        )}
      </div>
      <div className="x-axis">
        <span>0 с</span>
        <span>5 с</span>
        <span>10 с</span>
        <span>15 с</span>
      </div>
      <div className="plot-title spectrum-title">
        <span>Спектр сейчас</span>
        <span>
          Слабее <i className="legend" /> Сильнее
        </span>
      </div>
      <svg
        className="spectrum-line"
        viewBox="0 0 800 105"
        role="img"
        aria-label="Спектр текущего кадра"
      >
        <path
          d={path}
          fill="none"
          stroke="#baf776"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
