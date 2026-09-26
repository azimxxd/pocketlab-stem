import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChartNoAxesCombined } from 'lucide-react';
import type { DiscoveryStatus, Params } from '../../../../../packages/physics/discovery';
export const fmt = (n: number, d = 2) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
export type DiscoveryModel<M extends string> = {
  id: M;
  name: string;
  toggle: string;
  color: string;
  equation: (fit: Params) => string;
};
/** A trial in display units; error bars are whatever the scenario defines (bound or spread). */
export type PlotPoint = {
  id: string;
  x: number;
  y: number;
  xErr: number;
  yErr: number;
  included: boolean;
  label: string;
};
type Fit<M> = Params & {
  model: M;
  rmse: number;
  cvRmse: number | null;
  residuals: { trialId: string; value: number }[];
};
export function ModelDiscovery<M extends string>({
  title,
  conditionsLabel,
  plotTitle,
  sourceLabel,
  points,
  comparison,
  models,
  initialModel,
  predict,
  axes,
  statusText,
  children,
}: {
  title: string;
  conditionsLabel: string;
  plotTitle: string;
  sourceLabel: string;
  points: PlotPoint[];
  comparison: { fits: Fit<M>[]; bestModel: M | null; status: DiscoveryStatus };
  models: DiscoveryModel<M>[];
  initialModel: M;
  /** Model prediction at a display-unit x. */
  predict: (model: M, fit: Params, x: number) => number;
  axes: {
    x: string;
    y: string;
    unit: string;
    residual: string;
    digits: { x: number; y: number; error: number };
    floor: { x: number; y: number; residual: number };
    /** Units of the equation variables, e.g. «L в метрах, T в секундах.» */
    variables: string;
    plotLabel: string;
    note: string;
  };
  statusText: Record<DiscoveryStatus, string>;
  children?: ReactNode;
}) {
  const clip = useId();
  const [model, setModel] = useState<M>(initialModel);
  const [selected, setSelected] = useState<string | null>(null);
  const fit = comparison.fits.find((f) => f.model === model);
  const spec = (id: M) => models.find((m) => m.id === id)!;
  const maxX = Math.max(axes.floor.x, ...points.map((p) => p.x + p.xErr)) * 1.12;
  const maxY = Math.max(axes.floor.y, ...points.map((p) => p.y + p.yErr)) * 1.18;
  const px = (x: number) => 58 + (x / maxX) * 600;
  const py = (y: number) => 260 - (y / maxY) * 215;
  const selectedPoint = points.find((p) => p.id === selected);
  const samples = points.filter((p) => p.included);
  const minX = Math.min(...samples.map((p) => p.x)),
    lastX = Math.max(...samples.map((p) => p.x));
  const curve =
    fit && samples.length
      ? Array.from({ length: 81 }, (_, i) => {
          const x = minX + ((lastX - minX) * i) / 80;
          return `${i ? 'L' : 'M'}${px(x)},${py(predict(model, fit, x))}`;
        }).join(' ')
      : '';
  const residualMax = Math.max(
    axes.floor.residual,
    ...(fit?.residuals.map((r) => Math.abs(r.value)) ?? []),
  );
  return (
    <section className="discovery">
      <div className="section-heading">
        <div>
          <div className="eyebrow">03 / ОТКРОЙ ЗАКОНОМЕРНОСТЬ</div>
          <h2>{title}</h2>
        </div>
        <span className="pill">{conditionsLabel}</span>
      </div>
      <div className="discovery-grid">
        <div className="instrument model-plot">
          <div className="instrument-header">
            <span className="instrument-name">
              <ChartNoAxesCombined size={18} />
              {plotTitle}
            </span>
            <span className="source-label">{sourceLabel}</span>
          </div>
          <div className="model-toggles">
            {models.map((m) => (
              <button
                type="button"
                key={m.id}
                aria-pressed={model === m.id}
                className={model === m.id ? 'selected' : ''}
                onClick={() => setModel(m.id)}
                style={{ '--model-color': m.color } as CSSProperties}
              >
                {m.toggle}
              </button>
            ))}
          </div>
          <svg viewBox="0 0 700 310" role="img" aria-label={axes.plotLabel}>
            <defs>
              <clipPath id={clip}>
                <rect x="58" y="25" width="600" height="235" />
              </clipPath>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <path d={`M58 ${py(f * maxY)}H658`} stroke="#ffffff12" />
                <text x="49" y={py(f * maxY) + 4} textAnchor="end">
                  {fmt(f * maxY, axes.digits.y)}
                </text>
                <text x={px(f * maxX)} y="282" textAnchor="middle">
                  {fmt(f * maxX, axes.digits.x)}
                </text>
              </g>
            ))}
            <text x="17" y="24">
              {axes.y}
            </text>
            <text x="665" y="300" textAnchor="end">
              {axes.x}
            </text>
            <g clipPath={`url(#${clip})`}>
              <path
                d={curve}
                fill="none"
                stroke={spec(model).color}
                strokeWidth="2"
                strokeDasharray="7 5"
              />
              {points.map((p) => (
                <g key={p.id} opacity={p.included ? 1 : 0.3}>
                  <path
                    d={`M${px(p.x)} ${py(p.y - p.yErr)}V${py(p.y + p.yErr)}M${px(p.x - p.xErr)} ${py(p.y)}H${px(p.x + p.xErr)}`}
                    stroke="#aedbd3"
                  />
                  <circle
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={selected === p.id ? 7 : 5}
                    fill={p.included ? '#c7f2e9' : 'none'}
                    stroke="#c7f2e9"
                    tabIndex={0}
                    role="button"
                    aria-label={p.label}
                    onClick={() => setSelected(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(p.id);
                      }
                    }}
                  />
                </g>
              ))}
            </g>
          </svg>
          <p className="chart-help">{axes.note}</p>
          {selectedPoint && <p className="point-detail">Выбранная точка: {selectedPoint.label}.</p>}
        </div>
        <div className="model-summary white-card">
          <span className="eyebrow">ПРОВЕРКА ПО НОВЫМ УСЛОВИЯМ</span>
          <h3>
            {comparison.bestModel
              ? spec(comparison.bestModel).name
              : comparison.status === 'ambiguous'
                ? 'Модели пока трудно различить'
                : 'Нужно больше разных условий'}
          </h3>
          <p>{statusText[comparison.status]}</p>
          <div className="model-scores">
            {comparison.fits.map((f) => (
              <button
                type="button"
                key={f.model}
                className={model === f.model ? 'selected' : ''}
                onClick={() => setModel(f.model)}
              >
                <span>
                  <i style={{ background: spec(f.model).color }} />
                  {spec(f.model).name}
                </span>
                <b>
                  {f.cvRmse === null ? '—' : `${fmt(f.cvRmse, axes.digits.error)} ${axes.unit}`}
                </b>
                {comparison.bestModel === f.model && <Check size={15} />}
              </button>
            ))}
          </div>
          <small>
            Средняя ошибка прогноза (RMSE). Меньше — лучше. Все повторы одного условия исключаются
            из подбора вместе; затем модель предсказывает их.
          </small>
          {fit && (
            <div className="fit-equation">
              <b>{spec(model).equation(fit)}</b>
              <span>
                {axes.variables} Ошибка на собранных точках: {fmt(fit.rmse, axes.digits.error)}{' '}
                {axes.unit}.
              </span>
            </div>
          )}
        </div>
      </div>
      {fit && (
        <details className="residual-details">
          <summary>Посмотреть остатки: где модель ошибается?</summary>
          <p>
            Остаток = измеренное значение − предсказанное. Систематический рисунок может указывать
            на неподходящую модель или условия опыта.
          </p>
          <svg
            viewBox="0 0 700 150"
            role="img"
            aria-label={`Остатки выбранной модели, ${axes.unit}`}
          >
            <path d="M58 72H658" stroke="#879b8d" strokeDasharray="4 4" />
            <text x="8" y="18">
              {axes.residual}
            </text>
            <text x="8" y="77">
              0
            </text>
            <text x="655" y="145">
              {axes.x}
            </text>
            {fit.residuals.map((r) => {
              const p = points.find((p) => p.id === r.trialId)!;
              const y = 72 - (r.value / residualMax) * 45;
              return (
                <g key={r.trialId}>
                  <path d={`M${px(p.x)} 72V${y}`} stroke="#578577" />
                  <circle cx={px(p.x)} cy={y} r="4" fill="#315b49" />
                  <title>
                    {fmt(r.value, axes.digits.error + 1)} {axes.unit} · {p.label}
                  </title>
                </g>
              );
            })}
          </svg>
        </details>
      )}
      {children}
    </section>
  );
}
