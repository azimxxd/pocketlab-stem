import type {
  BounceAnalysis,
  FlightAnalysis,
  TrackPoint,
  VideoIssue,
} from '../../../../../packages/contracts';
import { toWorld } from '../../../../../packages/physics/kinematics';
import { fmt } from '../discovery/ModelDiscovery';
const issues: Record<VideoIssue, string> = {
  TOO_FEW_POINTS:
    'Мало отметок: нужно минимум 6 кадров полёта (для отскока — по 5 на каждую дугу).',
  SHORT_INTERVAL: 'Размеченный участок короче 0,15 с. Отметь больше кадров полёта.',
  TIME_SCALE_UNKNOWN:
    'Время кадров неизвестно: формат без надёжных меток времени или скорость съёмки не подтверждена. Разметка показана качественно, g не считается.',
  SCALE_MISSING: 'Масштаб не задан: отметь концы линейки или предмета известной длины.',
  SCALE_UNCERTAIN:
    'Масштаб неточный (больше 5%). Выбери отрезок длиннее или уточни его длину — ошибка масштаба не уменьшается от повторов.',
  MODEL_ASSUMPTION:
    'Точки плохо ложатся на выбранную модель: в интервал попали касание или отскок, сильное сопротивление воздуха или неточные отметки.',
  UNCERTAIN_POINTS: 'Часть отметок помечена как сомнительные.',
  CONTACT_MISSING: 'Отметь кадр касания пола: на нём должна быть отметка мяча.',
  APEX_EXTRAPOLATED:
    'Вершина одной из дуг лежит за пределами размеченных кадров — высота оценена продолжением параболы.',
  DEMO_DATA: 'Это учебная разметка без видео: точки сгенерированы, это не измерение.',
  AUTO_POINTS:
    'Часть отметок поставлена трекером (голубые). Пролистай кадры и исправь неверные: ручная отметка всегда заменяет автоматическую.',
  TRACK_LOST:
    'Трекер потерял мяч, и промежуток не заполнен выдуманными точками. Отметь пропущенный кадр вручную или запусти трекинг заново с него.',
};
/** Scatter of values over time with an optional model curve and marker. */
export function TrackPlot({
  title,
  unit,
  points,
  curve,
  marker,
}: {
  title: string;
  unit: string;
  points: { t: number; v: number; uncertain?: boolean }[];
  curve?: (t: number) => number;
  marker?: number;
}) {
  if (!points.length) return null;
  const t0 = Math.min(...points.map((p) => p.t)),
    t1 = Math.max(...points.map((p) => p.t), t0 + 1e-3);
  const values = points.map((p) => p.v);
  const samples = curve ? Array.from({ length: 61 }, (_, i) => t0 + ((t1 - t0) * i) / 60) : [];
  const all = [...values, ...samples.map((t) => curve!(t))];
  const lo = Math.min(...all),
    hi = Math.max(...all, lo + 1e-6);
  const px = (t: number) => 50 + ((t - t0) / (t1 - t0)) * 620;
  const py = (v: number) => 210 - ((v - lo) / (hi - lo)) * 180;
  return (
    <div className="instrument video-plot">
      <div className="plot-title">
        <span>
          {title}, {unit}
        </span>
        <span>t, с</span>
      </div>
      <svg
        viewBox="0 0 700 240"
        role="img"
        aria-label={`${title} от времени. Точки — отметки, пунктир — модель.`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <path d={`M50 ${py(lo + f * (hi - lo))}H670`} stroke="#ffffff12" />
            <text x="44" y={py(lo + f * (hi - lo)) + 4} textAnchor="end">
              {fmt(lo + f * (hi - lo), 2)}
            </text>
          </g>
        ))}
        <text x="50" y="232">
          {fmt(t0, 2)}
        </text>
        <text x="670" y="232" textAnchor="end">
          {fmt(t1, 2)}
        </text>
        {marker !== undefined && (
          <path d={`M${px(marker)} 20V215`} stroke="#e8bc84" strokeDasharray="4 4" />
        )}
        {curve && (
          <path
            d={samples.map((t, i) => `${i ? 'L' : 'M'}${px(t)},${py(curve(t))}`).join(' ')}
            fill="none"
            stroke="#c2f77e"
            strokeWidth="2"
            strokeDasharray="7 5"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={px(p.t)}
            cy={py(p.v)}
            r="4"
            fill={p.uncertain ? 'none' : '#c7f2e9'}
            stroke="#c7f2e9"
          />
        ))}
      </svg>
    </div>
  );
}
export function VideoResults({
  mode,
  points,
  flight,
  bounce,
  metersPerPx,
  timeFactor,
  contactT,
}: {
  mode: 'flight' | 'bounce';
  points: TrackPoint[];
  flight: FlightAnalysis;
  bounce: BounceAnalysis | null;
  metersPerPx: number | null;
  timeFactor: number | null;
  contactT?: number;
}) {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  if (sorted.length < 2) return null;
  const s = metersPerPx ?? 1,
    unit = metersPerPx ? 'м' : 'пикс.';
  const world = toWorld(sorted, s, timeFactor ?? 1);
  const acc = flight.acceleration;
  const quad = (f: { c0: number; c1: number; c2: number; tMean: number }) => (t: number) =>
    f.c0 + f.c1 * (t - f.tMean) + f.c2 * (t - f.tMean) ** 2;
  const reasons = mode === 'bounce' ? (bounce?.quality.reasons ?? []) : flight.quality.reasons;
  return (
    <section className="video-results">
      <div className="section-heading">
        <div>
          <div className="eyebrow">03 / РАЗБОР</div>
          <h2>{mode === 'flight' ? 'Какое ускорение у мяча?' : 'Какую высоту мяч вернул?'}</h2>
        </div>
        <span className="pill">
          {sorted.length} отметок · {fmt(flight.spanS, 2)} с
        </span>
      </div>
      <div className="video-plots">
        <TrackPlot
          title={metersPerPx ? 'Высота y' : 'Высота y (без масштаба)'}
          unit={unit}
          points={world.map((p, i) => ({ t: p.t, v: p.y, uncertain: sorted[i].uncertain }))}
          curve={mode === 'flight' && acc ? quad(acc.fitY) : undefined}
          marker={contactT !== undefined ? (contactT - sorted[0].t) / (timeFactor ?? 1) : undefined}
        />
        {mode === 'flight' && (
          <TrackPlot
            title="Горизонталь x"
            unit={unit}
            points={world.map((p, i) => ({ t: p.t, v: p.x, uncertain: sorted[i].uncertain }))}
            curve={acc ? quad(acc.fitX) : undefined}
          />
        )}
      </div>
      {mode === 'flight' ? (
        <div className="motion-results">
          <div className="white-card">
            <span className="eyebrow">ОЦЕНКА g ПО ВИДЕО</span>
            <h3>
              {flight.g !== null && acc
                ? `g ≈ ${fmt(flight.g, 2)} м/с²`
                : acc
                  ? 'g не оценивается'
                  : 'Недостаточно отметок'}
            </h3>
            {acc && (
              <p>
                Модель y = y₀ + v₀t + ½at² по каждой оси. |a| = {fmt(acc.magnitude, 2)}{' '}
                {metersPerPx ? 'м/с²' : 'пикс./с²'}
                {acc.statSe !== null && <> · разброс подбора ±{fmt(acc.statSe, 2)}</>}
                {metersPerPx && <> · граница из-за масштаба ±{fmt(acc.scaleBound, 2)} м/с²</>}.
              </p>
            )}
            <small>
              Разброс подбора показывает, насколько точки отклоняются от параболы. Ошибка масштаба —
              отдельная систематическая граница: она не уменьшается от числа отметок.
            </small>
          </div>
          <div className="white-card">
            <span className="eyebrow">ПРОВЕРКА УСТАНОВКИ</span>
            {acc ? (
              <>
                <h3>Наклон ускорения {fmt(Math.abs(acc.tiltDeg), 0)}°</h3>
                <p>
                  Угол между ускорением и «низом» кадра. Если он заметно больше нуля, камера была
                  наклонена или движение шло не в плоскости кадра. |a| по двум осям от наклона
                  камеры не зависит.
                </p>
                <small>Отклонение отметок от модели: {fmt(acc.rmsPx, 1)} пикс.</small>
              </>
            ) : (
              <p>Отметь не меньше трёх кадров, чтобы построить модель.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="motion-results">
          <div className="white-card">
            <span className="eyebrow">ОТСКОК</span>
            <h3>
              {bounce?.ratio != null ? `h₂/h₁ = ${fmt(bounce.ratio, 2)}` : 'Отношение не найдено'}
            </h3>
            {bounce?.h1Px != null && bounce.h2Px != null && (
              <p>
                Высота центра мяча над его положением в момент касания: до отскока{' '}
                {fmt(bounce.h1Px * s, metersPerPx ? 3 : 0)} {unit}, после —{' '}
                {fmt(bounce.h2Px * s, metersPerPx ? 3 : 0)} {unit}.
              </p>
            )}
            <small>
              Отношение высот не требует ни масштаба, ни единицы времени — только одну плоскость
              движения и согласованное время кадров.
            </small>
          </div>
          <div className="white-card">
            <span className="eyebrow">МОДЕЛЬНАЯ ОЦЕНКА</span>
            <h3>
              {bounce?.restitution != null
                ? `e ≈ ${fmt(bounce.restitution, 2)}`
                : 'e не оценивается'}
            </h3>
            <p>
              Для одного и того же мяча h₂/h₁ — это доля сохранённой потенциальной энергии.
              Коэффициент восстановления e ≈ √(h₂/h₁) — оценка при пренебрежимом сопротивлении
              воздуха и вертикальном отскоке, а не свойство мяча при любых условиях.
            </p>
          </div>
        </div>
      )}
      {reasons.length > 0 && (
        <ul className="quality-list">
          {reasons.map((code) => (
            <li key={code}>{issues[code]}</li>
          ))}
        </ul>
      )}
      <details className="method-details">
        <summary>Допущения и ограничения расчёта</summary>
        <p>
          Время каждой отметки — метка времени кадра из контейнера MP4/MOV, а не «номинальные» 30
          кадров/с. Для замедленной съёмки время делится на указанный коэффициент. Масштаб действует
          только в плоскости, где лежит линейка; движение ближе или дальше от камеры искажает
          расстояния (перспектива).
        </p>
        <p>
          Ускорение — удвоенный коэффициент параболы, подобранной методом наименьших квадратов по
          всем отметкам, а не вторая разность соседних точек. Скорость и ускорение берутся из
          модели. Касание и отскок в интервал полёта попадать не должны. Анализ:{' '}
          {mode === 'flight' ? flight.algorithmVersion : (bounce?.algorithmVersion ?? 'bounce-v1')}.
        </p>
      </details>
    </section>
  );
}
