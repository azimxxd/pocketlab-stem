import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  FlaskConical,
  Keyboard,
  Mic,
  Plus,
  RotateCcw,
  Save,
  Square,
  Wind,
} from 'lucide-react';
import {
  bottleInputSchema,
  type BottleInvestigation,
  type BottleTrial,
  type SelectionEvent,
} from '../../../../packages/contracts';
import { airVolume, compareBottle, createBottleDemo } from '../../../../packages/physics/bottle';
import { parseDecimal } from '../../../../packages/physics/pendulum';
import { steadyTone, type SteadyTone } from '../../../../packages/physics/sound';
import { startAudio, type AudioSession } from '../acquisition/audio';
import { saveInvestigation, download } from '../storage/notebook';
import { setLeaveGuard } from '../platform/leave-guard';
import { keepScreenOn } from '../platform/wake-lock';
import { BottleResults } from './BottleResults';
import { fmt } from './discovery/ModelDiscovery';
const CAPTURE_S = 5;
const toneIssues: Record<string, string> = {
  TOO_FEW_SAMPLES: 'Устойчивый тон звучал меньше полсекунды. Дуй ровно 2–3 секунды.',
  WEAK_PERIODICITY:
    'В большей части записи тон не выделяется из шума. Подуй сильнее или поднеси телефон ближе.',
  UNSTABLE_TONE:
    'Высота тона менялась. Дуй ровнее, не меняя силы и угла, — или тон перескакивал на другую частоту.',
  INTERRUPTED: 'Запись прервана. Держи страницу открытой до конца записи.',
};
type Capture = SteadyTone & {
  peaks: { t: number; hz: number | null }[];
  sampleRate: number;
  fftSize: number;
  settings: Record<string, string | number | boolean>;
  clipped: boolean;
};
export function BottleLab({
  onBack,
  onSaved,
  initial,
}: {
  onBack: () => void;
  onSaved: () => void;
  initial?: BottleInvestigation;
}) {
  const [hypothesis, setHypothesis] = useState(initial?.hypothesis ?? '');
  const hypothesisAt = useRef(initial?.hypothesisAt ?? '');
  const [trials, setTrials] = useState<BottleTrial[]>(initial?.trials ?? []);
  const [events, setEvents] = useState<SelectionEvent[]>(initial?.selectionEvents ?? []);
  const [conclusion, setConclusion] = useState(initial?.conclusion ?? '');
  const [source, setSource] = useState<BottleTrial['provenance']>(initial?.provenance ?? 'live');
  const [capacity, setCapacity] = useState(
    initial ? String(Math.round(initial.trials[0].input.capacityM3 * 1e6)) : '1500',
  );
  const [water, setWater] = useState('0');
  const [volumeError, setVolumeError] = useState('20');
  const [frequency, setFrequency] = useState('');
  const [frequencyError, setFrequencyError] = useState('5');
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording'>('idle');
  const [live, setLive] = useState<{ t: number; hz: number | null } | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const documentRef = useRef<BottleInvestigation | undefined>(initial);
  const session = useRef<AudioSession | null>(null);
  const controller = useRef<AbortController | null>(null);
  const peaks = useRef<{ t: number; hz: number | null }[]>([]);
  const clipped = useRef(false);
  const releaseScreen = useRef<(() => void) | null>(null);
  const busy = status !== 'idle';
  const dirty = busy || (!saved && trials.length > 0);
  useEffect(() => {
    setLeaveGuard(dirty ? 'Серия с бутылкой не сохранена. Уйти и потерять попытки?' : null);
    return () => setLeaveGuard(null);
  }, [dirty]);
  function finish(interrupted = false) {
    const active = session.current;
    if (!active) return;
    session.current = null;
    active.stop();
    releaseScreen.current?.();
    releaseScreen.current = null;
    setStatus('idle');
    setCapture({
      ...steadyTone(peaks.current, interrupted),
      peaks: peaks.current.slice(0, 400),
      sampleRate: active.sampleRate,
      fftSize: active.fftSize,
      settings: active.settings,
      clipped: clipped.current,
    });
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const hidden = () => {
      if (!document.hidden) return;
      if (session.current) finishRef.current(true);
      else controller.current?.abort();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      controller.current?.abort();
      session.current?.stop();
      releaseScreen.current?.();
    };
  }, []);
  const parsed = bottleInputSchema.safeParse({
    capacityM3: parseDecimal(capacity) * 1e-6,
    waterM3: parseDecimal(water) * 1e-6,
    volumeErrorM3: parseDecimal(volumeError) * 1e-6,
  });
  const manualHz = parseDecimal(frequency),
    manualError = parseDecimal(frequencyError);
  const manualValid = manualHz >= 20 && manualHz <= 4000 && manualError > 0 && manualError <= 500;
  const toneReady =
    source === 'live'
      ? !!capture && capture.frequencyHz !== null && capture.frequencyHz <= 4000
      : source === 'manual' && manualValid;
  const markDirty = () => setSaved(false);
  async function record() {
    setError('');
    setCapture(null);
    setLive(null);
    peaks.current = [];
    clipped.current = false;
    setStatus('requesting');
    const ac = new AbortController();
    controller.current = ac;
    try {
      const active = await startAudio(
        'live',
        (frame) => {
          peaks.current.push({ t: frame.t, hz: frame.peakHz });
          setLive({ t: frame.t, hz: frame.peakHz });
          if (frame.t >= CAPTURE_S) finishRef.current();
        },
        () => finishRef.current(true),
        () => {
          clipped.current = true;
        },
        ac.signal,
        { interpolatePeak: true },
      );
      if (ac.signal.aborted) {
        active.stop();
        return;
      }
      session.current = active;
      releaseScreen.current = keepScreenOn();
      setStatus('recording');
    } catch (e) {
      if (ac.signal.aborted) {
        setStatus('idle');
        return;
      }
      setStatus('idle');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Доступ к микрофону отклонён. Разреши его в настройках браузера или введи частоту вручную.'
          : e instanceof Error
            ? e.message
            : 'Не удалось запустить микрофон.',
      );
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }
  function add() {
    setError('');
    if (!parsed.success) {
      setError(
        'Проверь объёмы: бутылка 50–10 000 мл, вода меньше бутылки, погрешность положительная и меньше объёма воздуха.',
      );
      return;
    }
    if (trials.length >= 150) {
      setError('В исследовании уже 150 попыток. Сохрани его и начни новое.');
      return;
    }
    let tone: BottleTrial['tone'];
    if (source === 'live') {
      if (!capture || capture.frequencyHz === null || capture.spreadHz === null) return;
      tone = {
        kind: 'live',
        algorithmVersion: capture.algorithmVersion,
        frequencyHz: capture.frequencyHz,
        spreadHz: capture.spreadHz,
        voicedFrames: capture.voicedFrames,
        stableFrames: capture.stableFrames,
        totalFrames: capture.totalFrames,
        sampleRate: capture.sampleRate,
        fftSize: capture.fftSize,
        peaks: capture.peaks,
        audioSettings: capture.settings,
      };
    } else {
      if (!manualValid) return;
      tone = { kind: 'manual', frequencyHz: manualHz, frequencyErrorHz: manualError };
    }
    setTrials([
      ...trials,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        provenance: tone.kind,
        input: parsed.data,
        tone,
      },
    ]);
    setCapture(null);
    setLive(null);
    setFrequency('');
    markDirty();
  }
  function demo() {
    if (!hypothesis) return;
    setTrials(createBottleDemo());
    setSource('simulation');
    setCapacity('1500');
    markDirty();
    setError('');
  }
  function reset() {
    if (
      trials.length &&
      !window.confirm('Начать новое исследование? Несохранённые изменения серии будут потеряны.')
    )
      return;
    setTrials([]);
    setEvents([]);
    setSource('live');
    setConclusion('');
    setHypothesis('');
    hypothesisAt.current = '';
    documentRef.current = undefined;
    setSaved(false);
    setError('');
    setCapture(null);
  }
  function snapshot(): BottleInvestigation {
    const prior = documentRef.current;
    const now = new Date().toISOString();
    const revision = (prior?.revision ?? 0) + 1;
    return {
      schemaVersion: 2,
      scenarioId: 'bottle-01',
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
          result: compareBottle(trials, events),
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
  const air = parsed.success ? airVolume(parsed.data) * 1e6 : null;
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        Все исследования
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЛАБОРАТОРИЯ ЗВУКА · ОПЫТ 02</div>
          <h1>Собери музыкальный инструмент</h1>
          <p>Меняй объём воздуха в бутылке. Измеряй высоту тона. Найди закон.</p>
        </div>
        <span className="pill">
          <Wind size={16} />
          Бутылка · вода · мерный стакан
        </span>
      </div>
      <div className="pendulum-intro">
        <div className="white-card hypothesis-card">
          <div className="step-label">
            <span>01</span>Предположи
          </div>
          <h2>Больше воды — выше тон?</h2>
          <p>Если налить в бутылку воды, как изменится звук, когда дуешь над горлышком?</p>
          <fieldset disabled={trials.length > 0 || busy}>
            {['Станет выше', 'Станет ниже', 'Не изменится', 'Пока не знаю — исследую'].map(
              (text) => (
                <label key={text} className={`choice ${hypothesis === text ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="bottle-hypothesis"
                    checked={hypothesis === text}
                    onChange={() => {
                      setHypothesis(text);
                      hypothesisAt.current = new Date().toISOString();
                      markDirty();
                    }}
                  />
                  {text}
                </label>
              ),
            )}
          </fieldset>
          <small>Прогноз фиксируется до первой попытки.</small>
        </div>
        <div className="setup-card">
          <svg
            viewBox="0 0 300 200"
            role="img"
            aria-label="Схема: бутылка с водой; объём воздуха V — от поверхности воды до горлышка; дуть поперёк горлышка."
          >
            <path
              d="M135 20H165V52Q165 62 180 74Q200 90 200 115V180Q200 190 190 190H110Q100 190 100 180V115Q100 90 120 74Q135 62 135 52Z"
              fill="#f4f8f3"
              stroke="#284e3b"
              strokeWidth="3"
            />
            <path d="M102 140H198V180Q198 188 190 188H110Q102 188 102 180Z" fill="#aadbd3" />
            <path d="M215 76V138M210 76H220M210 138H220" stroke="#718d7b" />
            <text x="226" y="112">
              V
            </text>
            <path d="M95 14Q130 6 150 16" stroke="#51795d" fill="none" strokeDasharray="4 4" />
            <text x="40" y="18">
              струя
            </text>
            <text x="120" y="170">
              вода
            </text>
          </svg>
          <div>
            <h3>Телефон лежит рядом, 20–30 см</h3>
            <ol>
              <li>Узнай полный объём бутылки: по этикетке или мерным стаканом до края.</li>
              <li>Наливай воду мерным стаканом. Воздух V = бутылка − вода.</li>
              <li>Дуй поперёк горлышка ровно 2–3 секунды одинаковой силой.</li>
            </ol>
            <p>
              Пять уровней воды по три попытки. Не наливай выше плечиков бутылки — там меняется
              форма полости.
            </p>
          </div>
        </div>
      </div>
      {source !== 'simulation' ? (
        <section className="white-card timing-card">
          <div className="step-label">
            <span>02</span>Измерь
          </div>
          <div className="section-heading">
            <h2>Добавь попытку</h2>
            <div className="segmented" aria-label="Способ измерения частоты">
              <button
                disabled={trials.length > 0 || busy}
                className={source === 'live' ? 'active' : ''}
                onClick={() => setSource('live')}
              >
                <Mic size={16} />
                Микрофон
              </button>
              <button
                disabled={trials.length > 0 || busy}
                className={source === 'manual' ? 'active' : ''}
                onClick={() => {
                  setSource('manual');
                  setCapture(null);
                }}
              >
                <Keyboard size={16} />
                Ввести частоту
              </button>
            </div>
          </div>
          <fieldset disabled={!hypothesis || busy || saving} className="measurement-fields">
            <label>
              Объём бутылки, мл
              <input
                aria-label="Объём бутылки, мл"
                inputMode="decimal"
                value={capacity}
                disabled={trials.length > 0}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <label>
              Налито воды, мл
              <input
                aria-label="Налито воды, мл"
                inputMode="decimal"
                value={water}
                onChange={(e) => {
                  setWater(e.target.value);
                  setCapture(null);
                }}
              />
            </label>
            <label>
              Погрешность объёма, мл
              <input
                aria-label="Погрешность объёма, мл"
                inputMode="decimal"
                value={volumeError}
                onChange={(e) => setVolumeError(e.target.value)}
              />
            </label>
          </fieldset>
          <p className="subtle">
            {air !== null
              ? `Объём воздуха: ${fmt(air, 0)} мл. Бутылка не меняется в серии.`
              : 'Вода должна быть меньше объёма бутылки.'}
          </p>
          {source === 'live' ? (
            <div className="timer-row">
              <div className="timer-clock" role="status" aria-label="Текущая частота">
                {live?.hz != null ? fmt(live.hz, 0) : '—'}
                <small>Гц</small>
              </div>
              {status === 'recording' ? (
                <button className="primary" onClick={() => finish()}>
                  <Square size={16} />
                  Остановить ({fmt(Math.max(0, CAPTURE_S - (live?.t ?? 0)), 0)} с)
                </button>
              ) : status === 'requesting' ? (
                <button className="secondary" onClick={() => controller.current?.abort()}>
                  Отменить запуск
                </button>
              ) : (
                <button
                  className="secondary"
                  disabled={!hypothesis || !parsed.success || saving}
                  onClick={record}
                >
                  <Mic size={16} />
                  Записать тон
                </button>
              )}
              <span>Запись {CAPTURE_S} с. Начни дуть сразу после нажатия.</span>
              <button
                className="primary add-trial"
                disabled={!hypothesis || !parsed.success || !toneReady || busy || saving}
                onClick={add}
              >
                <Plus size={17} />
                Добавить попытку
              </button>
            </div>
          ) : (
            <>
              <fieldset disabled={!hypothesis || saving} className="measurement-fields">
                <label>
                  Частота, Гц
                  <input
                    aria-label="Частота, Гц"
                    inputMode="decimal"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    placeholder="Например: 180"
                  />
                </label>
                <label>
                  Граница ошибки частоты, Гц
                  <input
                    aria-label="Граница ошибки частоты, Гц"
                    inputMode="decimal"
                    value={frequencyError}
                    onChange={(e) => setFrequencyError(e.target.value)}
                  />
                </label>
              </fieldset>
              <div className="timer-row">
                <span>
                  Например, по приложению-тюнеру на другом устройстве. Частота 20–4000 Гц.
                </span>
                <button
                  className="primary add-trial"
                  disabled={!hypothesis || !parsed.success || !toneReady || saving}
                  onClick={add}
                >
                  <Plus size={17} />
                  Добавить попытку
                </button>
              </div>
            </>
          )}
          {capture && (
            <div className="trial-preview">
              <div>
                <span>Устойчивый тон</span>
                <strong>
                  {capture.frequencyHz !== null
                    ? `${fmt(capture.frequencyHz, 1)} ± ${fmt(capture.spreadHz!, 1)} Гц`
                    : 'не выделен'}
                </strong>
              </div>
              <div>
                <span>Кадров на плато</span>
                <strong>
                  {capture.stableFrames} из {capture.totalFrames}
                </strong>
              </div>
              <p>
                Медиана кадров в пределах ±3% от основного пика; ± — разброс тона, а не точность.
              </p>
              {capture.issues.map((code) => (
                <p key={code} className="measurement-warning">
                  {toneIssues[code]}
                </p>
              ))}
              {capture.frequencyHz !== null && capture.frequencyHz > 4000 && (
                <p className="measurement-warning">
                  Тон выше 4000 Гц — это не похоже на звук бутылки. Проверь, что дуешь над
                  горлышком.
                </p>
              )}
              {capture.clipped && (
                <p className="measurement-warning">
                  Сигнал перегружен. Отодвинь телефон подальше от горлышка.
                </p>
              )}
            </div>
          )}
          {!hypothesis && <p className="subtle">Сначала выбери гипотезу.</p>}
        </section>
      ) : (
        <div className="simulation-banner">
          <FlaskConical size={22} />
          <div>
            <b>Учебная серия · симуляция</b>
            <p>
              15 синтетических попыток: 5 уровней воды × 3 повтора в бутылке 1,5 л. Сгенерировано по
              модели резонатора с заданным горлышком и c = 343 м/с. Это не измерения телефона.
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
          <div>
            <h2>Одного тона мало для закона</h2>
            <p>
              Собери минимум пять уровней воды. Например, для бутылки 1,5 л: 0, 300, 600, 900 и 1100
              мл. Повторяй, чтобы увидеть разброс.
            </p>
            <button className="secondary" disabled={!hypothesis || busy} onClick={demo}>
              <FlaskConical size={16} />
              Посмотреть учебную серию
            </button>
            <small>Симуляция будет явно подписана и отделена от реальных опытов.</small>
          </div>
        </div>
      ) : (
        <>
          <BottleResults
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
              Что изменялось? Как менялась высота тона? Какая модель согласуется с данными и что
              ограничивает вывод?
            </p>
            <label className="field-label" htmlFor="bottle-conclusion">
              Вывод исследования
            </label>
            <textarea
              id="bottle-conclusion"
              value={conclusion}
              maxLength={3000}
              disabled={saving}
              onChange={(e) => {
                setConclusion(e.target.value);
                markDirty();
              }}
              placeholder="Когда воды стало больше… Тон… Моя гипотеза…"
            />
            <div className="result-actions">
              <button className="primary" disabled={saving || saved || busy} onClick={save}>
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
              <button className="text-button" disabled={busy || saving} onClick={reset}>
                <RotateCcw size={16} />
                Новое исследование
              </button>
            </div>
            <p className="subtle">
              Звук не сохраняется: в записи остаются только частоты кадров. Каждое сохранение
              создаёт новую версию анализа.
            </p>
          </section>
        </>
      )}
    </>
  );
}
