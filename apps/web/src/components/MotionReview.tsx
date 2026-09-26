import { useState } from 'react';
import type { MotionAnalysis, MotionSample } from '../../../../packages/contracts';
import { bodyRate, norm } from '../../../../packages/physics/motion';
import { MotionChart } from './MotionChart';
import { fmt } from './discovery/ModelDiscovery';
const issues: Record<MotionAnalysis['quality']['reasons'][number], string> = {
  TOO_FEW_SAMPLES: 'Запись короче 2 секунд или меньше 50 событий. Запиши дольше.',
  TIME_GAP:
    'В потоке датчиков есть разрывы. Не сворачивай страницу и не блокируй экран: браузер мог приостановить датчики.',
  NULL_SENSOR:
    'Часть событий пришла без ускорения. Пропуски показаны разрывами линии и не заменены нулями.',
  NO_ROTATION_SENSOR:
    'Гироскоп не прислал данных. Угловая скорость недоступна — на этом устройстве изучай наклон.',
  NO_STILL_SEGMENT:
    'Нет участков покоя от 0,8 с. Проекции силы тяжести не интерпретируются: положи телефон и подожди 2 секунды.',
  INTERRUPTED: 'Запись прервана. Данные до прерывания сохранены, но опыт лучше повторить.',
  DEMO_DATA:
    'Это синтетическая запись: она показывает, как работает анализ, но не является измерением телефона.',
};
export const axisName = { x: 'x (вправо)', y: 'y (вверх)', z: 'z (из экрана)' };
function movementHint(tilt: number, gyro: number | null) {
  if (gyro === null) return 'Гироскопа нет: виден только наклон относительно вертикали.';
  if (tilt < 10 && Math.abs(gyro) > 30)
    return 'Поворот почти не изменил наклон: вероятно, телефон повернули вокруг вертикали. Акселерометр такой поворот не видит, гироскоп — видит.';
  const diff = Math.abs(Math.abs(gyro) - tilt);
  if (diff <= 10) return 'Наклон и интеграл гироскопа согласуются.';
  return `Расхождение около ${fmt(diff, 0)}°. Возможные причины: поворот не вокруг одной оси, накопление ошибки гироскопа (дрейф), неполный покой до или после.`;
}
export function MotionReview({
  samples,
  analysis,
  simulated,
}: {
  samples: MotionSample[];
  analysis: MotionAnalysis;
  simulated: boolean;
}) {
  const end = samples.at(-1)?.t ?? 0;
  const [cursor, setCursor] = useState(end);
  const at = samples.reduce(
    (best, s) => (Math.abs(s.t - cursor) < Math.abs(best.t - cursor) ? s : best),
    samples[0],
  );
  const rate = at && bodyRate(at);
  const v = (n: number | null | undefined, d = 2) => (n == null ? '—' : fmt(n, d));
  return (
    <>
      <div className="instrument motion-instrument">
        <MotionChart
          kind="acceleration"
          samples={samples}
          from={0}
          to={Math.max(end, 1)}
          cursor={cursor}
          still={analysis.still}
        />
        <MotionChart
          kind="rotation"
          samples={samples}
          from={0}
          to={Math.max(end, 1)}
          cursor={cursor}
          still={analysis.still}
        />
        <p className="chart-help">Светлые полосы — участки покоя, найденные анализом.</p>
        <label className="motion-cursor">
          Время: {fmt(at?.t ?? 0, 2)} с
          <input
            aria-label="Позиция записи"
            type="range"
            min={0}
            max={end}
            step={0.01}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
          />
        </label>
        <div className="metrics motion-values">
          <div>
            <span>a (x, y, z), м/с²</span>
            <strong>
              {v(at?.accelerationWithGravity?.x)}; {v(at?.accelerationWithGravity?.y)};{' '}
              {v(at?.accelerationWithGravity?.z)}
            </strong>
          </div>
          <div>
            <span>|a|, м/с²</span>
            <strong>
              {v(at?.accelerationWithGravity ? norm(at.accelerationWithGravity) : null)}
            </strong>
          </div>
          <div>
            <span>ω (x, y, z), °/с</span>
            <strong>
              {v(rate?.x, 1)}; {v(rate?.y, 1)}; {v(rate?.z, 1)}
            </strong>
          </div>
        </div>
      </div>
      <div className="motion-results">
        <div className="white-card">
          <span className="eyebrow">НЕПОДВИЖНЫЙ ТЕЛЕФОН</span>
          <h3>
            {analysis.restMagnitude
              ? `|a| = ${fmt(analysis.restMagnitude.mean, 2)} ± ${fmt(analysis.restMagnitude.sd, 2)} м/с²`
              : 'Покой не найден'}
          </h3>
          <p>
            Неподвижный телефон показывает не ноль: датчик чувствует опору, которая удерживает его
            против силы тяжести. Поэтому величина называется «ускорение с гравитацией».{' '}
            {simulated
              ? 'Здесь число задано генератором учебной записи — это не измерение.'
              : 'Это измерение именно этого телефона: калибровка у разных устройств отличается.'}
          </p>
          {analysis.restMagnitude && (
            <small>
              По {analysis.restMagnitude.samples} событиям в {analysis.still.length} участках покоя;
              ± — разброс значений.
            </small>
          )}
        </div>
        <div className="white-card">
          <span className="eyebrow">ПОТОК ДАННЫХ</span>
          <h3>
            {analysis.rateHz ? `${fmt(analysis.rateHz, 0)} событий/с` : '—'} ·{' '}
            {fmt(analysis.durationS, 1)} с
          </h3>
          <p>
            {analysis.sampleCount} событий по меткам времени датчика. Разрывов:{' '}
            {analysis.gaps.count}
            {analysis.gaps.count ? `, самый длинный ${fmt(analysis.gaps.longestS, 2)} с` : ''}.
            Максимальная угловая скорость: x {v(analysis.peakRate.x, 0)}, y{' '}
            {v(analysis.peakRate.y, 0)}, z {v(analysis.peakRate.z, 0)} °/с.
          </p>
        </div>
      </div>
      <section className="motion-movements">
        <div className="section-heading">
          <h2>Угол и угловая скорость</h2>
          <span>Движений между участками покоя: {analysis.movements.length}</span>
        </div>
        <p>
          Гироскоп измеряет угловую скорость — как быстро телефон поворачивается. Угол получается,
          если сложить скорость за всё время поворота (интеграл). Акселерометр в покое показывает
          направление силы тяжести, поэтому наклон можно сравнить до и после движения.
        </p>
        {analysis.movements.length ? (
          <div className="table-scroll">
            <table className="trial-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Время, с</th>
                  <th>Наклон по гравитации</th>
                  <th>Интеграл гироскопа</th>
                  <th>Что это значит</th>
                </tr>
              </thead>
              <tbody>
                {analysis.movements.map((m, i) => {
                  const gyro = m.gyroDeg && m.dominantAxis ? m.gyroDeg[m.dominantAxis] : null;
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        {fmt(m.startS, 1)}–{fmt(m.endS, 1)}
                      </td>
                      <td>{fmt(m.tiltDeg, 0)}°</td>
                      <td>
                        {gyro === null ? '—' : `${fmt(gyro, 0)}°`}
                        {m.dominantAxis && <small>вокруг оси {axisName[m.dominantAxis]}</small>}
                        {m.spansGap && <small className="measurement-warning">есть разрыв</small>}
                      </td>
                      <td>{movementHint(m.tiltDeg, gyro)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="subtle">
            Чтобы сравнить угол и угловую скорость, сделай так: покой 2 с → поворот → покой 2 с.
          </p>
        )}
      </section>
      {analysis.quality.reasons.length > 0 && (
        <ul className="quality-list">
          {analysis.quality.reasons.map((code) => (
            <li key={code}>{issues[code]}</li>
          ))}
        </ul>
      )}
      <details className="method-details">
        <summary>Допущения и ограничения расчёта</summary>
        <p>
          Время — метки событий датчика, а не момент отрисовки. Покой — окно 0,5 с, где каждая
          компонента ускорения меняется меньше чем на 0,12 м/с² (стандартное отклонение), а угловая
          скорость меньше 4 °/с; участок не короче 0,8 с. Это инженерные пороги.
        </p>
        <p>
          Наклон — угол между средними векторами силы тяжести двух участков покоя; он не зависит от
          того, в какую сторону у платформы направлены оси. Интеграл гироскопа — сумма по трапециям
          с реальными интервалами; через разрывы не интегрируется. Направление осей и знаки на
          iPhone и Android могут различаться, поэтому сравниваются величины углов.
        </p>
        <p>
          По одному акселерометру нельзя восстановить перемещение или поворот вокруг вертикали.
          Анализ: {analysis.algorithmVersion}.
        </p>
      </details>
    </>
  );
}
