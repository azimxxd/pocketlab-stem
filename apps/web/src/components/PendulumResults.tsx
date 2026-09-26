import { useMemo, useState } from 'react';
import { Check, ChartNoAxesCombined, RotateCcw } from 'lucide-react';
import type { PendulumTrial, SelectionEvent, ModelId } from '../../../../packages/contracts';
import {
  analyzePendulum,
  comparePendulum,
  predict,
  trialSelection,
} from '../../../../packages/physics/pendulum';
export const modelNames: Record<ModelId, string> = {
  constant: 'Период не меняется',
  linear: 'Линейная зависимость',
  sqrt: 'Корневая зависимость',
};
const modelColors: Record<ModelId, string> = {
  constant: '#e8bc84',
  linear: '#86bbff',
  sqrt: '#c2f77e',
};
const fmt = (n: number, d = 2) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
export function PendulumResults({
  trials,
  events,
  onSelect,
}: {
  trials: PendulumTrial[];
  events: SelectionEvent[];
  onSelect?: (trialId: string, included: boolean, reason: string) => void;
}) {
  const comparison = useMemo(() => comparePendulum(trials, events), [trials, events]);
  const rows = trialSelection(trials, events);
  const [model, setModel] = useState<ModelId>('sqrt');
  const [selected, setSelected] = useState<string | null>(null);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const fit = comparison.fits.find((f) => f.model === model);
  const points = trials.map((t) => ({ ...t, ...analyzePendulum(t.input) }));
  const maxL = Math.max(0.2, ...points.map((p) => p.input.lengthM + p.input.lengthErrorM)) * 1.12;
  const maxT = Math.max(0.5, ...points.map((p) => p.period + p.periodError)) * 1.18;
  const px = (x: number) => 58 + (x / maxL) * 600;
  const py = (y: number) => 260 - (y / maxT) * 215;
  const selectedPoint = points.find((p) => p.id === selected);
  const samples = points.filter((p) => comparison.inputTrialIds.includes(p.id));
  const minL = Math.min(...samples.map((p) => p.input.lengthM)),
    lastL = Math.max(...samples.map((p) => p.input.lengthM));
  const curve =
    fit && samples.length
      ? Array.from({ length: 81 }, (_, i) => {
          const x = minL + ((lastL - minL) * i) / 80;
          return `${i ? 'L' : 'M'}${px(x)},${py(predict(model, fit, x))}`;
        }).join(' ')
      : '';
  const residualMax = Math.max(0.02, ...(fit?.residuals.map((r) => Math.abs(r.value)) ?? []));
  return (
    <section className="discovery">
      <div className="section-heading">
        <div>
          <div className="eyebrow">03 / ОТКРОЙ ЗАКОНОМЕРНОСТЬ</div>
          <h2>Какая модель объясняет твои данные?</h2>
        </div>
        <span className="pill">{comparison.distinctLengths} из 5 длин</span>
      </div>
      <div className="discovery-grid">
        <div className="instrument model-plot">
          <div className="instrument-header">
            <span className="instrument-name">
              <ChartNoAxesCombined size={18} />
              Период и длина
            </span>
            <span className="source-label">
              {trials[0]?.provenance === 'simulation' ? 'СИМУЛЯЦИЯ' : 'РУЧНЫЕ ИЗМЕРЕНИЯ'}
            </span>
          </div>
          <div className="model-toggles">
            {(['constant', 'linear', 'sqrt'] as const).map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={model === id}
                className={model === id ? 'selected' : ''}
                onClick={() => setModel(id)}
                style={{ '--model-color': modelColors[id] } as React.CSSProperties}
              >
                {id === 'constant' ? 'T = c' : id === 'linear' ? 'T = aL + b' : 'T = a√L'}
              </button>
            ))}
          </div>
          <svg
            viewBox="0 0 700 310"
            role="img"
            aria-label="График зависимости периода T в секундах от длины L в метрах. Точки — измерения, пунктир — выбранная модель. Значения доступны в таблице ниже."
          >
            <defs>
              <clipPath id="pendulum-plot-clip">
                <rect x="58" y="25" width="600" height="235" />
              </clipPath>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <path d={`M58 ${py(f * maxT)}H658`} stroke="#ffffff12" />
                <text x="49" y={py(f * maxT) + 4} textAnchor="end">
                  {fmt(f * maxT, 1)}
                </text>
                <text x={px(f * maxL)} y="282" textAnchor="middle">
                  {fmt(f * maxL, 2)}
                </text>
              </g>
            ))}
            <text x="17" y="24">
              T, с
            </text>
            <text x="665" y="300" textAnchor="end">
              L, м
            </text>
            <g clipPath="url(#pendulum-plot-clip)">
              <path
                d={curve}
                fill="none"
                stroke={modelColors[model]}
                strokeWidth="2"
                strokeDasharray="7 5"
              />
              {points.map((p, i) => {
                const included = comparison.inputTrialIds.includes(p.id);
                return (
                  <g key={p.id} opacity={included ? 1 : 0.3}>
                    <path
                      d={`M${px(p.input.lengthM)} ${py(p.period - p.periodError)}V${py(p.period + p.periodError)}M${px(p.input.lengthM - p.input.lengthErrorM)} ${py(p.period)}H${px(p.input.lengthM + p.input.lengthErrorM)}`}
                      stroke="#aedbd3"
                    />
                    <circle
                      cx={px(p.input.lengthM)}
                      cy={py(p.period)}
                      r={selected === p.id ? 7 : 5}
                      fill={included ? '#c7f2e9' : 'none'}
                      stroke="#c7f2e9"
                      tabIndex={0}
                      role="button"
                      aria-label={`Попытка ${i + 1}: ${fmt(p.input.lengthM)} м, ${fmt(p.period)} с`}
                      onClick={() => setSelected(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(p.id);
                        }
                      }}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
          <p className="chart-help">
            Точки — опыты · линии у точек — введённые границы погрешности · пунктир — модель только
            в измеренном диапазоне.
          </p>
          {selectedPoint && (
            <p className="point-detail">
              Выбранная точка: L = {fmt(selectedPoint.input.lengthM)} м, T ={' '}
              {fmt(selectedPoint.period, 3)} ± {fmt(selectedPoint.periodError, 3)} с.
            </p>
          )}
        </div>
        <div className="model-summary white-card">
          <span className="eyebrow">ПРОВЕРКА ПО НОВЫМ УСЛОВИЯМ</span>
          <h3>
            {comparison.bestModel
              ? modelNames[comparison.bestModel]
              : comparison.status === 'ambiguous'
                ? 'Модели пока трудно различить'
                : 'Нужно больше разных условий'}
          </h3>
          <p>
            {comparison.status === 'insufficient'
              ? 'Измерь минимум пять разных длин. Повторы улучшают проверку, но не заменяют новые длины.'
              : comparison.status === 'narrow-range'
                ? 'Расширь диапазон: самая длинная нить должна быть хотя бы вдвое длиннее самой короткой.'
                : comparison.status === 'ambiguous'
                  ? 'Ошибки моделей близки. Добавь повторы и длину, при которой прогнозы заметно различаются.'
                  : 'В этих условиях эта модель лучше предсказывает периоды для длины, которую не видела при подборе.'}
          </p>
          <div className="model-scores">
            {comparison.fits.map((f) => (
              <button
                type="button"
                key={f.model}
                className={model === f.model ? 'selected' : ''}
                onClick={() => setModel(f.model)}
              >
                <span>
                  <i style={{ background: modelColors[f.model] }} />
                  {modelNames[f.model]}
                </span>
                <b>{f.cvRmse === null ? '—' : fmt(f.cvRmse, 3) + ' с'}</b>
                {comparison.bestModel === f.model && <Check size={15} />}
              </button>
            ))}
          </div>
          <small>
            Средняя ошибка прогноза (RMSE). Меньше — лучше. Все повторы одной длины исключаются из
            подбора вместе; затем модель предсказывает их.
          </small>
          {fit && (
            <div className="fit-equation">
              <b>
                {model === 'constant'
                  ? `T = ${fmt(fit.b, 3)}`
                  : model === 'sqrt'
                    ? `T = ${fmt(fit.a, 3)}√L`
                    : `T = ${fmt(fit.a, 3)}L ${fit.b < 0 ? '−' : '+'} ${fmt(Math.abs(fit.b), 3)}`}
              </b>
              <span>
                L в метрах, T в секундах. Ошибка на собранных точках: {fmt(fit.rmse, 3)} с.
              </span>
            </div>
          )}
        </div>
      </div>
      {fit && (
        <details className="residual-details">
          <summary>Посмотреть остатки: где модель ошибается?</summary>
          <p>
            Остаток = измеренный период − предсказанный. Систематический рисунок может указывать на
            неподходящую модель или условия опыта.
          </p>
          <svg viewBox="0 0 700 150" role="img" aria-label="Остатки выбранной модели, в секундах">
            <path d="M58 72H658" stroke="#879b8d" strokeDasharray="4 4" />
            <text x="8" y="18">
              ΔT, с
            </text>
            <text x="8" y="77">
              0
            </text>
            <text x="655" y="145">
              L, м
            </text>
            {fit.residuals.map((r) => {
              const t = trials.find((t) => t.id === r.trialId)!;
              const y = 72 - (r.value / residualMax) * 45;
              return (
                <g key={r.trialId}>
                  <path d={`M${px(t.input.lengthM)} 72V${y}`} stroke="#578577" />
                  <circle cx={px(t.input.lengthM)} cy={y} r="4" fill="#315b49" />
                  <title>
                    {fmt(r.value, 4)} с при {fmt(t.input.lengthM)} м
                  </title>
                </g>
              );
            })}
          </svg>
        </details>
      )}
      {comparison.squaredFit?.g != null && comparison.bestModel === 'sqrt' && (
        <div className="law-reveal">
          <div>
            <span className="eyebrow">ОТ ДАННЫХ К ФОРМУЛЕ</span>
            <h3>T = 2π√(L/g)</h3>
            <p>Для малых колебаний компактного груза квадрат периода пропорционален длине.</p>
          </div>
          <div>
            <span>Оценка g по наклону T²(L)</span>
            <strong>
              {fmt(comparison.squaredFit.g, 2)} <small>м/с²</small>
            </strong>
            <p>g = 4π²/a; a = {fmt(comparison.squaredFit.slope, 3)} с²/м</p>
          </div>
        </div>
      )}
      <details className="method-details">
        <summary>Допущения и ограничения расчёта</summary>
        <p>
          Длина — от подвеса до центра компактного груза; угол 5–10°; отпускание без толчка. Изменяй
          только длину, оставляя груз и способ измерения прежними. Подбор обычный, без весов: он не
          учитывает ошибку длины как случайную переменную. При больших погрешностях вывод ограничен.
        </p>
        <p>
          Сравниваются ошибки моделей на одной шкале T. Подбор T² = aL + b используется отдельно для
          оценки g.{' '}
          {comparison.squaredFit && (
            <>Свободный член b = {fmt(comparison.squaredFit.intercept, 3)} с². </>
          )}
          Ненулевой b может быть связан с систематической ошибкой, но сам по себе не доказывает её
          причину. Число g — модельная оценка без доверительного интервала.
        </p>
        <p>
          Порог пяти длин, диапазон 2× и различие ошибок минимум 0,01 с / 5% — инженерные правила, а
          не статистический тест достоверности. Ошибку модели не надо путать с погрешностью
          измерения.
        </p>
      </details>
      <div className="section-heading trial-heading">
        <h2>Попытки и условия</h2>
        <span>
          {trials.length} записей · {comparison.inputTrialIds.length} в анализе
        </span>
      </div>
      <div className="table-scroll">
        <table className="trial-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Длина, м</th>
              <th>Колебаний</th>
              <th>Время, с</th>
              <th>Период, с</th>
              <th>Анализ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ trial: t, included, event }, i) => {
              const a = analyzePendulum(t.input);
              return (
                <tr key={t.id} className={!included ? 'excluded' : ''}>
                  <td>{i + 1}</td>
                  <td>
                    {fmt(t.input.lengthM, 3)}
                    <small>± {fmt(t.input.lengthErrorM, 3)}</small>
                  </td>
                  <td>{t.input.cycles}</td>
                  <td>
                    {fmt(t.input.elapsedS, 3)}
                    <small>± {fmt(t.input.timingErrorS, 3)}</small>
                  </td>
                  <td>
                    {fmt(a.period, 3)}
                    <small>± {fmt(a.periodError, 3)}</small>
                    {a.issues.length > 0 && (
                      <small className="measurement-warning">
                        {a.issues.includes('FEW_CYCLES') ? 'Мало периодов' : 'Большая погрешность'}
                      </small>
                    )}
                  </td>
                  <td>
                    {onSelect ? (
                      <button
                        className="text-button"
                        onClick={() => {
                          if (included) {
                            setExcluding(t.id);
                            setReason('');
                          } else onSelect(t.id, true, 'Возвращено пользователем в анализ');
                        }}
                      >
                        {included ? (
                          'Исключить'
                        ) : (
                          <>
                            <RotateCcw size={14} />
                            Вернуть
                          </>
                        )}
                      </button>
                    ) : (
                      <span>{included ? 'Включена' : 'Исключена'}</span>
                    )}
                    {!included && <small>{event?.reason}</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {excluding && onSelect && (
        <form
          className="exclude-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) {
              onSelect(excluding, false, reason.trim());
              setExcluding(null);
            }
          }}
        >
          <label htmlFor="exclusion-reason">
            Почему исключаем попытку {trials.findIndex((t) => t.id === excluding) + 1}?
          </label>
          <input
            id="exclusion-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: сбился при подсчёте колебаний"
            required
          />
          <button className="secondary" disabled={!reason.trim()}>
            Подтвердить исключение
          </button>
          <button className="text-button" type="button" onClick={() => setExcluding(null)}>
            Отмена
          </button>
        </form>
      )}
      {events.length > 0 && (
        <details className="method-details">
          <summary>История изменения выборки ({events.length})</summary>
          <ul>
            {events.map((e) => (
              <li key={e.id}>
                Попытка {trials.findIndex((t) => t.id === e.trialId) + 1}:{' '}
                {e.included ? 'возвращена' : 'исключена'} — {e.reason}.
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
