import { useMemo } from 'react';
import type { PendulumTrial, SelectionEvent, ModelId } from '../../../../packages/contracts';
import { analyzePendulum, comparePendulum, predict } from '../../../../packages/physics/pendulum';
import { ModelDiscovery, fmt, type DiscoveryModel } from './discovery/ModelDiscovery';
import { TrialAudit } from './discovery/TrialAudit';
const models: DiscoveryModel<ModelId>[] = [
  {
    id: 'constant',
    name: 'Период не меняется',
    toggle: 'T = c',
    color: '#e8bc84',
    equation: (f) => `T = ${fmt(f.b, 3)}`,
  },
  {
    id: 'linear',
    name: 'Линейная зависимость',
    toggle: 'T = aL + b',
    color: '#86bbff',
    equation: (f) => `T = ${fmt(f.a, 3)}L ${f.b < 0 ? '−' : '+'} ${fmt(Math.abs(f.b), 3)}`,
  },
  {
    id: 'sqrt',
    name: 'Корневая зависимость',
    toggle: 'T = a√L',
    color: '#c2f77e',
    equation: (f) => `T = ${fmt(f.a, 3)}√L`,
  },
];
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
  const points = trials.map((t, i) => {
    const a = analyzePendulum(t.input);
    return {
      id: t.id,
      x: t.input.lengthM,
      y: a.period,
      xErr: t.input.lengthErrorM,
      yErr: a.periodError,
      included: comparison.inputTrialIds.includes(t.id),
      label: `Попытка ${i + 1}: L = ${fmt(t.input.lengthM)} м, T = ${fmt(a.period, 3)} ± ${fmt(a.periodError, 3)} с`,
    };
  });
  return (
    <ModelDiscovery
      title="Какая модель объясняет твои данные?"
      conditionsLabel={`${comparison.distinctLengths} из 5 длин`}
      plotTitle="Период и длина"
      sourceLabel={trials[0]?.provenance === 'simulation' ? 'СИМУЛЯЦИЯ' : 'РУЧНЫЕ ИЗМЕРЕНИЯ'}
      points={points}
      comparison={comparison}
      models={models}
      initialModel="sqrt"
      predict={predict}
      axes={{
        x: 'L, м',
        y: 'T, с',
        unit: 'с',
        residual: 'ΔT, с',
        digits: { x: 2, y: 1, error: 3 },
        floor: { x: 0.2, y: 0.5, residual: 0.02 },
        variables: 'L в метрах, T в секундах.',
        plotLabel:
          'График зависимости периода T в секундах от длины L в метрах. Точки — измерения, пунктир — выбранная модель. Значения доступны в таблице ниже.',
        note: 'Точки — опыты · линии у точек — введённые границы погрешности · пунктир — модель только в измеренном диапазоне.',
      }}
      statusText={{
        insufficient:
          'Измерь минимум пять разных длин. Повторы улучшают проверку, но не заменяют новые длины.',
        'narrow-range':
          'Расширь диапазон: самая длинная нить должна быть хотя бы вдвое длиннее самой короткой.',
        ambiguous:
          'Ошибки моделей близки. Добавь повторы и длину, при которой прогнозы заметно различаются.',
        compared:
          'В этих условиях эта модель лучше предсказывает периоды для длины, которую не видела при подборе.',
      }}
    >
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
      <TrialAudit
        trials={trials}
        events={events}
        inAnalysis={comparison.inputTrialIds.length}
        placeholder="Например: сбился при подсчёте колебаний"
        onSelect={onSelect}
        columns={[
          {
            header: 'Длина, м',
            cell: (t) => (
              <>
                {fmt(t.input.lengthM, 3)}
                <small>± {fmt(t.input.lengthErrorM, 3)}</small>
              </>
            ),
          },
          { header: 'Колебаний', cell: (t) => t.input.cycles },
          {
            header: 'Время, с',
            cell: (t) => (
              <>
                {fmt(t.input.elapsedS, 3)}
                <small>± {fmt(t.input.timingErrorS, 3)}</small>
              </>
            ),
          },
          {
            header: 'Период, с',
            cell: (t) => {
              const a = analyzePendulum(t.input);
              return (
                <>
                  {fmt(a.period, 3)}
                  <small>± {fmt(a.periodError, 3)}</small>
                  {a.issues.length > 0 && (
                    <small className="measurement-warning">
                      {a.issues.includes('FEW_CYCLES') ? 'Мало периодов' : 'Большая погрешность'}
                    </small>
                  )}
                </>
              );
            },
          },
        ]}
      />
    </ModelDiscovery>
  );
}
