import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  FlaskConical,
  Plus,
  RotateCcw,
  Save,
  Square,
  Timer,
} from 'lucide-react';
import {
  pendulumInputSchema,
  type PendulumTrial,
  type SelectionEvent,
  type PendulumInvestigation,
} from '../../../../packages/contracts';
import {
  analyzePendulum,
  comparePendulum,
  parseDecimal,
} from '../../../../packages/physics/pendulum';
import { createPendulumDemo } from '../../../../packages/physics/pendulum-demo';
import { saveInvestigation, download } from '../storage/notebook';
import { PendulumResults } from './PendulumResults';
import { setLeaveGuard } from '../platform/leave-guard';
import { keepScreenOn } from '../platform/wake-lock';
export function PendulumLab({
  onBack,
  onSaved,
  initial,
}: {
  onBack: () => void;
  onSaved: () => void;
  initial?: PendulumInvestigation;
}) {
  const [hypothesis, setHypothesis] = useState(initial?.hypothesis ?? '');
  const hypothesisAt = useRef(initial?.hypothesisAt ?? '');
  const [trials, setTrials] = useState<PendulumTrial[]>(initial?.trials ?? []);
  const [events, setEvents] = useState<SelectionEvent[]>(initial?.selectionEvents ?? []);
  const [conclusion, setConclusion] = useState(initial?.conclusion ?? '');
  const [source, setSource] = useState<'manual' | 'simulation'>(initial?.provenance ?? 'manual');
  const [length, setLength] = useState('0,50');
  const [cycles, setCycles] = useState('10');
  const [elapsed, setElapsed] = useState('');
  const [lengthError, setLengthError] = useState('0,005');
  const [timeError, setTimeError] = useState('0,3');
  const [method, setMethod] = useState<'timer' | 'entered'>('entered');
  const [running, setRunning] = useState(false);
  const [clock, setClock] = useState(0);
  const started = useRef<number | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const documentRef = useRef<PendulumInvestigation | undefined>(initial);
  const dirty = running || (!saved && trials.length > 0);
  useEffect(() => {
    setLeaveGuard(
      dirty ? 'Серия маятника не сохранена. Уйти и потерять несохранённые попытки?' : null,
    );
    return () => setLeaveGuard(null);
  }, [dirty]);
  useEffect(() => {
    if (!running) return;
    const releaseScreen = keepScreenOn();
    const timer = setInterval(() => {
      if (started.current !== null) {
        const seconds = (performance.now() - started.current) / 1000;
        if (seconds > 600) {
          started.current = null;
          setRunning(false);
          setElapsed('');
          setError('Достигнут предел 10 минут. Запись не добавлена.');
        } else setClock(seconds);
      }
    }, 40);
    const interrupted = () => {
      if (document.hidden) {
        started.current = null;
        setRunning(false);
        setElapsed('');
        setError('Таймер прерван: страница была скрыта. Повтори измерение.');
      }
    };
    document.addEventListener('visibilitychange', interrupted);
    return () => {
      releaseScreen();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', interrupted);
    };
  }, [running]);
  const parsed = pendulumInputSchema.safeParse({
    lengthM: parseDecimal(length),
    cycles: parseDecimal(cycles),
    elapsedS: parseDecimal(elapsed),
    lengthErrorM: parseDecimal(lengthError),
    timingErrorS: parseDecimal(timeError),
  });
  const preview = parsed.success ? analyzePendulum(parsed.data) : null;
  const markDirty = () => setSaved(false);
  function add() {
    setError('');
    if (!parsed.success) {
      setError(
        'Проверь числа: длина 0,05–5 м, целое число периодов 1–100, время 0,1–600 с. Погрешности положительные и меньше измерений.',
      );
      return;
    }
    if (trials.length >= 150) {
      setError('В исследовании уже 150 попыток. Сохрани его и начни новое.');
      return;
    }
    setTrials([
      ...trials,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        provenance: 'manual',
        acquisitionKind: method,
        input: parsed.data,
      },
    ]);
    setElapsed('');
    setClock(0);
    markDirty();
  }
  function startTimer() {
    setError('');
    setElapsed('');
    setClock(0);
    setMethod('timer');
    started.current = performance.now();
    setRunning(true);
  }
  function stopTimer() {
    if (started.current === null) return;
    const time = (performance.now() - started.current) / 1000;
    started.current = null;
    setRunning(false);
    setClock(time);
    setElapsed(time.toFixed(3));
  }
  function demo() {
    if (!hypothesis) return;
    setTrials(createPendulumDemo());
    setSource('simulation');
    markDirty();
    setError('');
  }
  function reset() {
    if (
      trials.length &&
      !window.confirm(
        'Начать новое исследование? Несохранённые изменения текущей серии будут потеряны.',
      )
    )
      return;
    setTrials([]);
    setEvents([]);
    setSource('manual');
    setConclusion('');
    setHypothesis('');
    hypothesisAt.current = '';
    documentRef.current = undefined;
    setSaved(false);
    setError('');
    setElapsed('');
    setClock(0);
  }
  function snapshot(): PendulumInvestigation {
    const prior = documentRef.current;
    const now = new Date().toISOString();
    const revision = (prior?.revision ?? 0) + 1;
    return {
      schemaVersion: 2,
      scenarioId: 'pendulum-01',
      scenarioVersion: 1,
      id: prior?.id ?? crypto.randomUUID(),
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      revision,
      provenance: source,
      hypothesis,
      hypothesisAt: hypothesisAt.current,
      conclusion,
      trials,
      selectionEvents: events,
      analyses: [
        ...(prior?.analyses ?? []),
        {
          id: crypto.randomUUID(),
          at: now,
          revision,
          conclusion,
          selectionEventIds: events.map((e) => e.id),
          result: comparePendulum(trials, events),
        },
      ],
    };
  }
  /** A saved series exports as stored; a draft exports as the revision a save would create. */
  const exportable = () => (saved && documentRef.current) || snapshot();
  async function save() {
    setSaving(true);
    setError('');
    try {
      if ((documentRef.current?.analyses.length ?? 0) >= 100)
        throw new Error(
          'Достигнут предел 100 сохранённых версий. Экспортируй исследование и начни новое.',
        );
      const doc = snapshot();
      await saveInvestigation(doc);
      documentRef.current = doc;
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error && e.message.startsWith('Достигнут')
          ? e.message
          : 'Не удалось сохранить исследование. Скачай JSON: данные остаются на этом экране.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        Все исследования
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЛАБОРАТОРИЯ ДВИЖЕНИЯ · ОПЫТ 01</div>
          <h1>Открой закон маятника</h1>
          <p>Меняй длину. Измеряй период. Пусть данные выберут модель.</p>
        </div>
        <span className="pill">
          <Timer size={16} />
          Нитка · груз · линейка
        </span>
      </div>
      <div className="pendulum-intro">
        <div className="white-card hypothesis-card">
          <div className="step-label">
            <span>01</span>Предположи
          </div>
          <h2>Длиннее нить — медленнее колебания?</h2>
          <p>Если увеличить длину в четыре раза, как изменится период?</p>
          <fieldset disabled={trials.length > 0 || running}>
            {[
              'Не изменится',
              'Увеличится в 4 раза',
              'Увеличится в 2 раза',
              'Пока не знаю — исследую',
            ].map((text) => (
              <label key={text} className={`choice ${hypothesis === text ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="pendulum-hypothesis"
                  checked={hypothesis === text}
                  onChange={() => {
                    setHypothesis(text);
                    hypothesisAt.current = new Date().toISOString();
                    markDirty();
                  }}
                />
                {text}
              </label>
            ))}
          </fieldset>
          <small>
            Прогноз фиксируется до первой попытки. Можно ошибиться — для этого и нужен опыт.
          </small>
        </div>
        <div className="setup-card">
          <svg
            viewBox="0 0 300 200"
            role="img"
            aria-label="Схема установки: длина от точки подвеса до центра груза; угол отклонения не больше 10 градусов."
          >
            <path d="M70 25H230" stroke="#718d7b" strokeWidth="5" />
            <path d="M150 25V170" stroke="#aec3b3" strokeDasharray="4 5" />
            <path d="M150 25L175 168" stroke="#284e3b" strokeWidth="3" />
            <circle cx="175" cy="168" r="14" fill="#aadb83" stroke="#284e3b" strokeWidth="2" />
            <path d="M135 25V166M130 25H140M130 166H140" stroke="#718d7b" />
            <text x="110" y="105">
              L
            </text>
            <path d="M150 80Q157 81 160 80" stroke="#284e3b" fill="none" />
            <text x="169" y="82">
              5–10°
            </text>
            <text x="95" y="196">
              СХЕМА УСТАНОВКИ
            </text>
          </svg>
          <div>
            <h3>Телефон остаётся на столе</h3>
            <ol>
              <li>Измерь длину до центра небольшого груза.</li>
              <li>Отклони груз на 5–10° и отпусти без толчка.</li>
              <li>
                Засеки 10 полных колебаний. Начало и конец — прохождение отметки в одном
                направлении.
              </li>
            </ol>
            <p>
              Два прохода отметки в разных направлениях — только один период. Повтори опыт 3 раза
              для каждой длины.
            </p>
          </div>
        </div>
      </div>
      {source === 'manual' ? (
        <section className="white-card timing-card">
          <div className="step-label">
            <span>02</span>Измерь
          </div>
          <div className="section-heading">
            <h2>Добавь реальную попытку</h2>
            <span className="pill">Ручное измерение</span>
          </div>
          <fieldset disabled={!hypothesis || running || saving} className="measurement-fields">
            <label>
              Длина нити L, м
              <input
                aria-label="Длина нити L, м"
                inputMode="decimal"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </label>
            <label>
              Полных колебаний N
              <input
                aria-label="Полных колебаний N"
                inputMode="numeric"
                value={cycles}
                onChange={(e) => setCycles(e.target.value)}
              />
            </label>
            <label>
              Общее время, с
              <input
                aria-label="Общее время, с"
                inputMode="decimal"
                value={elapsed}
                onChange={(e) => {
                  setElapsed(e.target.value);
                  setMethod('entered');
                }}
                placeholder="Например: 14,2"
              />
            </label>
          </fieldset>
          <details className="uncertainty-settings">
            <summary>Погрешности измерений</summary>
            <p>
              Оцени возможную ошибку длины и суммарную ошибку времени на старте и остановке.
              Значения ниже — начальные предположения, а не калибровка телефона.
            </p>
            <fieldset disabled={running || saving} className="measurement-fields">
              <label>
                Граница ошибки длины, м
                <input
                  aria-label="Граница ошибки длины, м"
                  inputMode="decimal"
                  value={lengthError}
                  onChange={(e) => setLengthError(e.target.value)}
                />
              </label>
              <label>
                Граница ошибки времени, с
                <input
                  aria-label="Граница ошибки времени, с"
                  inputMode="decimal"
                  value={timeError}
                  onChange={(e) => setTimeError(e.target.value)}
                />
              </label>
            </fieldset>
          </details>
          <div className="timer-row">
            <div className="timer-clock" role="timer" aria-label="Время секундомера">
              {clock.toFixed(2)}
              <small>с</small>
            </div>
            {running ? (
              <button className="primary" onClick={stopTimer}>
                <Square size={16} />
                Остановить таймер
              </button>
            ) : (
              <button className="secondary" disabled={!hypothesis || saving} onClick={startTimer}>
                <Timer size={16} />
                Запустить таймер
              </button>
            )}
            <span>Или введи время с собственного секундомера.</span>
            <button
              className="primary add-trial"
              disabled={!hypothesis || !parsed.success || running || saving || trials.length >= 150}
              onClick={add}
            >
              <Plus size={17} />
              Добавить попытку
            </button>
          </div>
          {preview && !running && (
            <div className="trial-preview">
              <div>
                <span>Период T = t/N</span>
                <strong>
                  {preview.period.toFixed(3)} ± {preview.periodError.toFixed(3)} с
                </strong>
              </div>
              <div>
                <span>Оценка g = 4π²L/T²</span>
                <strong>{preview.g.toFixed(2)} м/с²</strong>
              </div>
              <p>
                По введённым границам ошибок: {preview.gLow.toFixed(2)}–{preview.gHigh.toFixed(2)}{' '}
                м/с². Это диапазон при допущениях модели, не доверительный интервал.
              </p>
              {preview.issues.length > 0 && (
                <p className="measurement-warning">
                  {preview.issues.includes('FEW_CYCLES')
                    ? 'Измеряй хотя бы 5, лучше 10 полных периодов. '
                    : ''}
                  {preview.issues.includes('LENGTH_ERROR') ||
                  preview.issues.includes('TIMING_ERROR')
                    ? 'Большая относительная погрешность: уточни длину или измерь больше периодов.'
                    : ''}
                </p>
              )}
            </div>
          )}
          {!hypothesis && <p className="subtle">Сначала выбери гипотезу.</p>}
          {hypothesis && elapsed && !parsed.success && (
            <p className="error" role="alert">
              Проверь числа: длина 0,05–5 м; периоды — целое число от 1 до 100; время 0,1–600 с;
              погрешности должны быть меньше измерений. Можно использовать запятую или точку.
            </p>
          )}
        </section>
      ) : (
        <div className="simulation-banner">
          <FlaskConical size={22} />
          <div>
            <b>Учебная серия · симуляция</b>
            <p>
              15 синтетических попыток: 5 длин × 3 повтора. Сгенерировано по модели с g = 9,81 м/с²
              и заданными отклонениями времени. Это не измерения телефона.
            </p>
          </div>
          <button className="secondary" onClick={reset}>
            Начать реальный опыт
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {trials.length === 0 ? (
        <div className="series-empty">
          <ChartPreview />
          <div>
            <h2>Одной точки мало для открытия</h2>
            <p>
              Собери минимум пять разных длин. Например: 0,20; 0,35; 0,50; 0,75 и 1,00 м. Повторяй
              измерения, чтобы увидеть разброс.
            </p>
            <button className="secondary" disabled={!hypothesis || running} onClick={demo}>
              <FlaskConical size={16} />
              Посмотреть учебную серию
            </button>
            <small>Симуляция будет явно подписана и отделена от реальных опытов.</small>
          </div>
        </div>
      ) : (
        <>
          <PendulumResults
            trials={trials}
            events={events}
            onSelect={
              saving
                ? undefined
                : (trialId, included, reason) => {
                    if (events.length >= 1000) {
                      setError('Достигнут предел истории изменений. Сохрани исследование.');
                      return;
                    }
                    setEvents([
                      ...events,
                      {
                        id: crypto.randomUUID(),
                        trialId,
                        included,
                        reason,
                        at: new Date().toISOString(),
                      },
                    ]);
                    markDirty();
                  }
            }
          />
          <section className="white-card conclusion-card">
            <div className="step-label">
              <span>04</span>Объясни
            </div>
            <h2>Какой вывод ты сделаешь?</h2>
            <p>
              Что изменялось? Какая модель согласуется с данными? Что могло повлиять на точность?
            </p>
            <label className="field-label" htmlFor="pendulum-conclusion">
              Вывод исследования
            </label>
            <textarea
              id="pendulum-conclusion"
              value={conclusion}
              maxLength={3000}
              disabled={saving}
              onChange={(e) => {
                setConclusion(e.target.value);
                markDirty();
              }}
              placeholder="Когда длина увеличилась… Период… Моя гипотеза…"
            />
            <div className="result-actions">
              <button className="primary" disabled={saving || saved || running} onClick={save}>
                {saved ? <Check size={17} /> : <Save size={17} />}{' '}
                {saved ? 'Серия сохранена' : saving ? 'Сохраняем…' : 'Сохранить серию'}
              </button>
              <button className="secondary" onClick={() => download(exportable(), 'json')}>
                <Download size={16} />
                JSON
              </button>
              <button className="secondary" onClick={() => download(exportable(), 'csv')}>
                CSV
              </button>
              <button className="text-button" disabled={running || saving} onClick={reset}>
                <RotateCcw size={16} />
                Новое исследование
              </button>
            </div>
            <p className="subtle">
              Исходные попытки и история исключений сохраняются. Каждое сохранение создаёт новую
              версию анализа.
            </p>
          </section>
        </>
      )}
    </>
  );
}
function ChartPreview() {
  return (
    <svg
      viewBox="0 0 200 120"
      role="img"
      aria-label="Иллюстрация: точки серии позволяют сравнить разные зависимости"
    >
      <path d="M20 10V100H190" fill="none" stroke="#9cb3a0" />
      {[
        [35, 88],
        [65, 73],
        [95, 59],
        [130, 45],
        [170, 30],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="4" fill="#51795d" />
      ))}
      <path d="M25 95Q80 45 180 22" fill="none" stroke="#91b984" strokeDasharray="5 5" />
    </svg>
  );
}
