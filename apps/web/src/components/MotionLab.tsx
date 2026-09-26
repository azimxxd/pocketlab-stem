import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  FlaskConical,
  Play,
  Rotate3D,
  Save,
  Smartphone,
  Square,
} from 'lucide-react';
import type { MotionInvestigation, MotionSample } from '../../../../packages/contracts';
import {
  analyzeMotion,
  createMotionDemo,
  norm,
  quasiStatic,
  bodyRate,
} from '../../../../packages/physics/motion';
import { recordMotion, type MotionRecording } from '../acquisition/motion';
import { saveInvestigation, download } from '../storage/notebook';
import { setLeaveGuard } from '../platform/leave-guard';
import { keepScreenOn } from '../platform/wake-lock';
import { MotionChart } from './MotionChart';
import { MotionReview } from './MotionReview';
import { fmt } from './discovery/ModelDiscovery';
const LIMIT_S = 60;
function PhoneAxes() {
  return (
    <svg
      viewBox="0 0 220 200"
      role="img"
      aria-label="Схема осей телефона: x — вправо вдоль экрана, y — вверх вдоль экрана, z — из экрана к тебе."
    >
      <defs>
        <marker
          id="axis-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10Z" fill="#284e3b" />
        </marker>
      </defs>
      <rect
        x="70"
        y="30"
        width="80"
        height="150"
        rx="14"
        fill="#f4f8f3"
        stroke="#284e3b"
        strokeWidth="3"
      />
      <rect x="80" y="44" width="60" height="118" rx="4" fill="#dfeee5" />
      <path d="M110 105H190" stroke="#284e3b" strokeWidth="2.5" markerEnd="url(#axis-arrow)" />
      <path d="M110 105V12" stroke="#284e3b" strokeWidth="2.5" markerEnd="url(#axis-arrow)" />
      <circle cx="110" cy="105" r="8" fill="none" stroke="#284e3b" strokeWidth="2.5" />
      <circle cx="110" cy="105" r="2.5" fill="#284e3b" />
      <text x="194" y="110">
        x
      </text>
      <text x="117" y="16">
        y
      </text>
      <text x="92" y="126">
        z
      </text>
      <text x="4" y="196">
        СХЕМА ОСЕЙ
      </text>
    </svg>
  );
}
export function MotionLab({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [hypothesis, setHypothesis] = useState('');
  const [hypothesisAt, setHypothesisAt] = useState('');
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording'>('idle');
  const [, setTick] = useState(0);
  const [result, setResult] = useState<MotionInvestigation | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const buffer = useRef<MotionSample[]>([]);
  const recording = useRef<MotionRecording | null>(null);
  const controller = useRef<AbortController | null>(null);
  const releaseScreen = useRef<(() => void) | null>(null);
  const hypothesisRef = useRef({ hypothesis: '', at: '' });
  function build(samples: MotionSample[], provenance: 'live' | 'simulation', interrupted: boolean) {
    const item: MotionInvestigation = {
      schemaVersion: 2,
      scenarioId: 'motion-01',
      scenarioVersion: 1,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      provenance,
      hypothesis: hypothesisRef.current.hypothesis,
      hypothesisAt: hypothesisRef.current.at,
      conclusion: '',
      interrupted,
      reportedIntervalMs: recording.current?.reportedIntervalMs() ?? null,
      samples,
      analysis: analyzeMotion(samples, { interrupted, simulation: provenance === 'simulation' }),
    };
    setResult(item);
    setSaved(false);
    setConclusion('');
  }
  function finish(interrupted = false) {
    const active = recording.current;
    if (!active) return;
    active.stop();
    releaseScreen.current?.();
    releaseScreen.current = null;
    setStatus('idle');
    // Browsers without sensors may still fire events whose every field is null.
    if (buffer.current.some((s) => s.accelerationWithGravity || s.rotationRate))
      build([...buffer.current], 'live', interrupted);
    else
      setError(
        `Датчики не прислали данных (событий: ${buffer.current.length}, все значения пустые). На компьютере датчиков обычно нет; на телефоне открой приложение в Safari или Chrome по HTTPS.`,
      );
    recording.current = null;
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const hidden = () => {
      if (!document.hidden) return;
      if (recording.current) finishRef.current(true);
      else controller.current?.abort();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      controller.current?.abort();
      recording.current?.stop();
      releaseScreen.current?.();
    };
  }, []);
  useEffect(() => {
    if (status !== 'recording') return;
    // Sensor events arrive up to ~100 Hz; the screen refreshes at ~12 Hz from the buffer.
    const timer = setInterval(() => setTick((n) => n + 1), 80);
    return () => clearInterval(timer);
  }, [status]);
  const unsaved = !!result && !saved;
  useEffect(() => {
    setLeaveGuard(
      status === 'recording' || unsaved
        ? 'Запись датчиков не сохранена в дневнике. Уйти без сохранения?'
        : null,
    );
    return () => setLeaveGuard(null);
  }, [status, unsaved]);
  async function start() {
    setError('');
    setResult(null);
    buffer.current = [];
    hypothesisRef.current = { hypothesis, at: hypothesisAt };
    setStatus('requesting');
    const ac = new AbortController();
    controller.current = ac;
    try {
      // The permission request must stay the first await of this click on iOS.
      const active = await recordMotion(
        ac.signal,
        (sample) => buffer.current.push(sample),
        () => finishRef.current(),
      );
      if (ac.signal.aborted) {
        active.stop();
        return;
      }
      recording.current = active;
      releaseScreen.current = keepScreenOn();
      setStatus('recording');
    } catch (e) {
      setStatus('idle');
      if (!ac.signal.aborted)
        setError(e instanceof Error ? e.message : 'Не удалось запустить датчики.');
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }
  function demo() {
    setError('');
    hypothesisRef.current = { hypothesis, at: hypothesisAt };
    build(createMotionDemo(), 'simulation', false);
  }
  async function save() {
    if (!result) return;
    setSaving(true);
    setError('');
    try {
      await saveInvestigation({ ...result, conclusion });
      setSaved(true);
      onSaved();
    } catch {
      setError(
        'Не удалось сохранить на устройстве. Результат ещё здесь — скачай JSON, чтобы не потерять его.',
      );
    } finally {
      setSaving(false);
    }
  }
  const samples = buffer.current;
  const last = samples.at(-1);
  const now = last?.t ?? 0;
  const shownTime = status === 'recording' ? now : (result?.analysis.durationS ?? 0);
  const shownCount = status === 'recording' ? samples.length : (result?.samples.length ?? 0);
  const recent = samples.filter((s) => s.t >= now - 0.5);
  const rate = last && bodyRate(last);
  const busy = status !== 'idle';
  const v = (n: number | null | undefined, d = 2) => (n == null ? '—' : fmt(n, d));
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        Все исследования
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЛАБОРАТОРИЯ ДВИЖЕНИЯ · ОПЫТ 02</div>
          <h1>Что чувствует телефон?</h1>
          <p>Наклоняй и поворачивай телефон. Разберись, что измеряют акселерометр и гироскоп.</p>
        </div>
        <span className="pill">
          <Smartphone size={16} />
          Только телефон · 2–5 мин
        </span>
      </div>
      <div className="pendulum-intro">
        <div className="white-card hypothesis-card">
          <div className="step-label">
            <span>01</span>Предположи
          </div>
          <h2>Телефон лежит на столе неподвижно</h2>
          <p>Какой модуль ускорения покажет датчик?</p>
          <fieldset disabled={busy || !!result}>
            {[
              'Ноль — телефон же не движется',
              'Около 9,8 м/с²',
              'Зависит от того, как лежит телефон',
              'Пока не знаю — проверю',
            ].map((text) => (
              <label key={text} className={`choice ${hypothesis === text ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="motion-hypothesis"
                  checked={hypothesis === text}
                  onChange={() => {
                    setHypothesis(text);
                    setHypothesisAt(new Date().toISOString());
                  }}
                />
                {text}
              </label>
            ))}
          </fieldset>
          <small>Прогноз фиксируется до записи.</small>
        </div>
        <div className="setup-card">
          <PhoneAxes />
          <div>
            <h3>Покой → движение → покой</h3>
            <ol>
              <li>Положи телефон экраном вверх и не трогай 2–3 секунды.</li>
              <li>Медленно поставь его на длинное ребро и снова подожди 2 секунды.</li>
              <li>Не отрывая от стола, поверни его вокруг вертикали и подожди ещё 2 секунды.</li>
            </ol>
            <p>
              Оси привязаны к телефону, а не к комнате. Поэтому при наклоне меняется, какая ось
              «смотрит» вверх.
            </p>
          </div>
        </div>
      </div>
      <section className="white-card timing-card">
        <div className="step-label">
          <span>02</span>Измерь
        </div>
        <div className="section-heading">
          <h2>Запись датчиков</h2>
          <span className={`source-label ${result?.provenance === 'simulation' ? 'demo' : ''}`}>
            {result?.provenance === 'simulation' ? 'СИМУЛЯЦИЯ' : 'ДАТЧИКИ ТЕЛЕФОНА'} ·{' '}
            {status === 'recording' ? 'ЗАПИСЬ' : result ? 'ЗАВЕРШЕНО' : 'ГОТОВ'}
          </span>
        </div>
        {status === 'recording' && (
          <div className="instrument motion-instrument">
            <MotionChart
              kind="acceleration"
              samples={samples}
              from={Math.max(0, now - 10)}
              to={Math.max(10, now)}
            />
            <MotionChart
              kind="rotation"
              samples={samples}
              from={Math.max(0, now - 10)}
              to={Math.max(10, now)}
            />
            <div className="metrics motion-values">
              <div>
                <span>|a|, м/с²</span>
                <strong>
                  {v(last?.accelerationWithGravity ? norm(last.accelerationWithGravity) : null)}
                </strong>
              </div>
              <div>
                <span>ω (x, y, z), °/с</span>
                <strong>
                  {v(rate?.x, 0)}; {v(rate?.y, 0)}; {v(rate?.z, 0)}
                </strong>
              </div>
              <div>
                <span>Состояние</span>
                <strong>{quasiStatic(recent) ? 'Покой' : 'Движение'}</strong>
              </div>
            </div>
          </div>
        )}
        <div className="timer-row">
          <div className="timer-clock" role="timer" aria-label="Время записи">
            {fmt(shownTime, 1)}
            <small>/ {LIMIT_S} с</small>
          </div>
          {status === 'recording' ? (
            <button className="primary" onClick={() => finish()}>
              <Square size={16} />
              Завершить запись
            </button>
          ) : status === 'requesting' ? (
            <button className="secondary" onClick={() => controller.current?.abort()}>
              Отменить запуск
            </button>
          ) : (
            <button className="primary" disabled={!hypothesis || saving} onClick={start}>
              <Play size={16} />
              {result ? 'Записать заново' : 'Начать запись'}
            </button>
          )}
          <span>Разрешение на датчики запрашивается по нажатию. Событий: {shownCount}.</span>
          <button className="secondary" disabled={!hypothesis || busy} onClick={demo}>
            <FlaskConical size={16} />
            Учебная запись
          </button>
        </div>
        {!hypothesis && <p className="subtle">Сначала выбери гипотезу.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {result && (
        <>
          {result.provenance === 'simulation' && (
            <div className="simulation-banner">
              <FlaskConical size={22} />
              <div>
                <b>Учебная запись · симуляция</b>
                <p>
                  9 секунд, 100 событий/с: покой → наклон на 90° вокруг оси x → покой → поворот на
                  180° вокруг вертикали → покой. Сгенерировано с g = 9,81 м/с² и небольшим шумом.
                  Это не данные датчиков.
                </p>
              </div>
            </div>
          )}
          <div className="section-heading motion-heading">
            <div>
              <div className="eyebrow">03 / РАЗБОР</div>
              <h2>Что показали датчики?</h2>
            </div>
            <span className="pill">
              <Rotate3D size={15} />
              {result.analysis.quality.status === 'valid'
                ? 'Данные пригодны'
                : result.analysis.quality.status === 'warning'
                  ? 'Есть ограничения'
                  : 'Запись стоит повторить'}
            </span>
          </div>
          <MotionReview
            samples={result.samples}
            analysis={result.analysis}
            simulated={result.provenance === 'simulation'}
          />
          <section className="white-card conclusion-card">
            <div className="step-label">
              <span>04</span>Объясни
            </div>
            <h2>Какой вывод ты сделаешь?</h2>
            <p>
              Подтвердилась ли гипотеза «{result.hypothesis}»? Почему неподвижный телефон не
              показывает ноль? Чем угол отличается от угловой скорости?
            </p>
            <label className="field-label" htmlFor="motion-conclusion">
              Вывод исследования
            </label>
            <textarea
              id="motion-conclusion"
              value={conclusion}
              maxLength={3000}
              disabled={saving}
              onChange={(e) => {
                setConclusion(e.target.value);
                setSaved(false);
              }}
              placeholder="Когда телефон лежал… Модуль ускорения… При повороте…"
            />
            <div className="result-actions">
              <button className="primary" disabled={saving || saved} onClick={save}>
                {saved ? <Check size={17} /> : <Save size={17} />}{' '}
                {saved ? 'Сохранено в дневнике' : saving ? 'Сохраняем…' : 'Сохранить исследование'}
              </button>
              <button
                className="secondary"
                onClick={() => download({ ...result, conclusion }, 'json')}
              >
                <Download size={16} />
                JSON
              </button>
              <button
                className="secondary"
                onClick={() => download({ ...result, conclusion }, 'csv')}
              >
                CSV
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
