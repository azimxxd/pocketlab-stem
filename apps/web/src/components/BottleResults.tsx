import { useMemo } from 'react';
import type { BottleModelId, BottleTrial, SelectionEvent } from '../../../../packages/contracts';
import { airVolume, compareBottle, toneError } from '../../../../packages/physics/bottle';
import { predictModel } from '../../../../packages/physics/discovery';
import { ModelDiscovery, fmt, type DiscoveryModel } from './discovery/ModelDiscovery';
import { TrialAudit } from './discovery/TrialAudit';
const ml = (m3: number) => m3 * 1e6;
// Fits are in SI (V in m³); equations are shown with V in millilitres.
const models: DiscoveryModel<BottleModelId>[] = [
  {
    id: 'constant',
    name: 'Высота не меняется',
    toggle: 'f = c',
    color: '#e8bc84',
    equation: (f) => `f = ${fmt(f.b, 1)}`,
  },
  {
    id: 'linear',
    name: 'Линейная зависимость',
    toggle: 'f = aV + b',
    color: '#86bbff',
    equation: (f) => `f = ${fmt(f.a * 1e-6, 4)}V ${f.b < 0 ? '−' : '+'} ${fmt(Math.abs(f.b), 1)}`,
  },
  {
    id: 'inverse-sqrt',
    name: 'Обратно корню объёма',
    toggle: 'f = a/√V',
    color: '#c2f77e',
    equation: (f) => `f = ${fmt(f.a * 1000, 0)}/√V`,
  },
];
export const sourceNames = { live: 'Микрофон', manual: 'Вручную', simulation: 'Симуляция' };
export function BottleResults({
  trials,
  events,
  onSelect,
}: {
  trials: BottleTrial[];
  events: SelectionEvent[];
  onSelect?: (trialId: string, included: boolean, reason: string) => void;
}) {
  const comparison = useMemo(() => compareBottle(trials, events), [trials, events]);
  const points = trials.map((t, i) => ({
    id: t.id,
    x: ml(airVolume(t.input)),
    y: t.tone.frequencyHz,
    xErr: ml(t.input.volumeErrorM3),
    yErr: toneError(t),
    included: comparison.inputTrialIds.includes(t.id),
    label: `Попытка ${i + 1}: воздух ${fmt(ml(airVolume(t.input)), 0)} мл, f = ${fmt(t.tone.frequencyHz, 1)} Гц`,
  }));
  const inverse = comparison.inverseFit;
  return (
    <ModelDiscovery
      title="Как высота тона зависит от объёма воздуха?"
      conditionsLabel={`${comparison.distinctVolumes} из 5 объёмов`}
      plotTitle="Частота и объём воздуха"
      sourceLabel={sourceNames[trials[0]?.provenance ?? 'live'].toUpperCase()}
      points={points}
      comparison={comparison}
      models={models}
      initialModel="inverse-sqrt"
      predict={(model, fit, xMl) => predictModel(model, fit, xMl * 1e-6)}
      axes={{
        x: 'V, мл',
        y: 'f, Гц',
        unit: 'Гц',
        residual: 'Δf, Гц',
        digits: { x: 0, y: 0, error: 1 },
        floor: { x: 100, y: 50, residual: 2 },
        variables: 'V — объём воздуха в мл, f в Гц.',
        plotLabel:
          'График зависимости частоты тона f в герцах от объёма воздуха V в миллилитрах. Точки — измерения, пунктир — выбранная модель. Значения доступны в таблице ниже.',
        note: 'Точки — опыты · вертикальные линии — разброс тона (микрофон) или граница ошибки (ввод) · пунктир — модель только в измеренном диапазоне.',
      }}
      statusText={{
        insufficient:
          'Нужно минимум пять разных уровней воды. Повторы улучшают проверку, но не заменяют новые объёмы.',
        'narrow-range':
          'Расширь диапазон: самый большой объём воздуха должен быть хотя бы вдвое больше самого маленького.',
        ambiguous:
          'Ошибки моделей близки. Добавь повторы и объёмы на краях диапазона, где прогнозы расходятся сильнее.',
        compared:
          'В этих условиях эта модель лучше предсказывает частоту для объёма, который не видела при подборе.',
      }}
    >
      {inverse && comparison.bestModel === 'inverse-sqrt' && inverse.slope > 0 && (
        <div className="law-reveal">
          <div>
            <span className="eyebrow">ОТ ДАННЫХ К ФОРМУЛЕ</span>
            <h3>f = c/(2π)·√(A/(V·L))</h3>
            <p>
              Резонатор Гельмгольца: воздух в горлышке колеблется на «пружине» из воздуха в бутылке.
              При той же форме горлышка f ∝ 1/√V: вдвое больше воздуха — тон ниже примерно в 1,41
              раза.
            </p>
          </div>
          <div>
            <span>Проверка f²·V = const</span>
            <strong>
              {fmt(inverse.slope * 1000, 0)} <small>Гц²·л</small>
            </strong>
            <p>Наклон f² от 1/V; свободный член {fmt(inverse.intercept, 0)} Гц².</p>
          </div>
        </div>
      )}
      <details className="method-details">
        <summary>Допущения и ограничения расчёта</summary>
        <p>
          V — объём воздуха в бутылке: полный объём минус налитая вода. Модель резонатора
          предполагает постоянное горлышко и полость заметно больше горлышка; когда вода доходит до
          плечиков бутылки, форма полости меняется. Возбуждение (сила и угол струи), концевые
          поправки горлышка и температура воздуха тоже влияют на тон.
        </p>
        <p>
          Частота с микрофона — медиана устойчивых кадров; пик уточняется между линиями спектра (шаг
          сетки fs/N ≈ 11–12 Гц). Разброс — половина межквартильного размаха кадров, это
          изменчивость тона, а не гарантированная точность. Шумоподавление браузера запрошено
          выключенным; фактические настройки сохраняются.
        </p>
        <p>
          Модели сравниваются на шкале f. Подбор f² = k/V + b показан отдельно; ненулевой b может
          указывать на ограничения модели, но сам по себе не доказывает причину. Порог пяти объёмов,
          диапазон 2× и различие ошибок 2 Гц / 5% — инженерные правила, а не статистический тест.
        </p>
      </details>
      <TrialAudit
        trials={trials}
        events={events}
        inAnalysis={comparison.inputTrialIds.length}
        placeholder="Например: подул сильнее и тон перескочил"
        onSelect={onSelect}
        columns={[
          {
            header: 'Воздух, мл',
            cell: (t) => (
              <>
                {fmt(ml(airVolume(t.input)), 0)}
                <small>± {fmt(ml(t.input.volumeErrorM3), 0)}</small>
              </>
            ),
          },
          { header: 'Вода, мл', cell: (t) => fmt(ml(t.input.waterM3), 0) },
          {
            header: 'Частота, Гц',
            cell: (t) => (
              <>
                {fmt(t.tone.frequencyHz, 1)}
                <small>
                  {t.tone.kind === 'live' ? 'разброс' : 'граница'} ± {fmt(toneError(t), 1)}
                </small>
              </>
            ),
          },
          {
            header: 'Источник',
            cell: (t) =>
              t.tone.kind === 'live' ? (
                <>
                  Микрофон
                  <small>
                    {t.tone.stableFrames} из {t.tone.totalFrames} кадров
                  </small>
                </>
              ) : (
                sourceNames[t.tone.kind]
              ),
          },
        ]}
      />
    </ModelDiscovery>
  );
}
