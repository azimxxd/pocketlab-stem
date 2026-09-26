import { useEffect, useRef } from 'react';
import type { SpectrumFrame } from '../../../../packages/contracts';
export function Spectrum({
  frames,
  frequencyMax = 8000,
}: {
  frames: SpectrumFrame[];
  frequencyMax?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width,
      h = canvas.height;
    ctx.fillStyle = '#102c2b';
    ctx.fillRect(0, 0, w, h);
    const displayed = frames.slice(-300);
    displayed.forEach((frame) => {
      frame.bins.forEach((db, y) => {
        const power = Math.max(0, Math.min(1, (db + 90) / 65));
        ctx.fillStyle = `hsl(${170 - power * 95} ${40 + power * 50}% ${9 + power * 61}%)`;
        ctx.fillRect(
          (frame.t * w) / 15,
          h - ((y + 1) * h) / frame.bins.length,
          Math.ceil(w / 300),
          Math.ceil(h / frame.bins.length),
        );
      });
    });
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
