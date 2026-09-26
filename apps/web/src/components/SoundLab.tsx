import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Download,
  FlaskConical,
  Mic,
  Play,
  Save,
  Square,
  Volume2,
} from 'lucide-react';
import type { Investigation, SpectrumFrame } from '../../../../packages/contracts';
import { analyzeSound } from '../../../../packages/physics/sound';
import { startAudio, type AudioSession } from '../acquisition/audio';
import { saveInvestigation, download } from '../storage/notebook';
import { Spectrum } from './Spectrum';
const reasons: Record<string, string> = {
  TOO_SHORT: 'Запись короче двух секунд. Повтори опыт и запиши хотя бы 5 секунд.',
  NO_STABLE_TONE:
    'Устойчивый тон не выделен в достаточном числе кадров. Попробуй протяжный свист или гласную.',
  INTERRUPTED: 'Запись прервана. Для непрерывного опыта держи страницу открытой.',
  CLIPPING: 'Обнаружена перегрузка сигнала. Отодвинь телефон от источника звука.',
  DEMO_DATA:
    'Это синтетический сигнал. Он помогает изучить график, но не считается реальным измерением.',
};
export function SoundLab({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [hypothesis, setHypothesis] = useState('');
  const [hypothesisAt, setHypothesisAt] = useState('');
  const [mode, setMode] = useState<'live' | 'simulation'>('live');
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'finished'>('idle');
  const [frames, setFrames] = useState<SpectrumFrame[]>([]);
  const [result, setResult] = useState<Investigation | null>(null);
  const [error, setError] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tone, setTone] = useState(440);
  const session = useRef<AudioSession | null>(null);
  const controller = useRef<AbortController | null>(null);
  const recording = useRef(false);
  const buffer = useRef<SpectrumFrame[]>([]);
  const clipped = useRef(false);
  const settings = useRef({
    mode: 'live' as 'live' | 'simulation',
    hypothesis: '',
    hypothesisAt: '',
  });
  function finish(interrupted = false) {
    if (!recording.current) return;
    recording.current = false;
    const active = session.current;
    session.current?.stop();
    session.current = null;
    setStatus('finished');
    if (active && buffer.current.length) {
      const item: Investigation = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        scenarioId: 'sound-01',
        scenarioVersion: 1,
        provenance: settings.current.mode,
        hypothesis: settings.current.hypothesis,
        hypothesisAt: settings.current.hypothesisAt,
        conclusion: '',
        sampleRate: active.sampleRate,
        fftSize: active.fftSize,
        frequencyMax: active.frequencyMax,
        frames: [...buffer.current],
        analysis: analyzeSound(
          buffer.current,
          interrupted,
          settings.current.mode === 'simulation',
          clipped.current,
        ),
        audioSettings: active.settings,
      };
      setResult(item);
    } else setError('Полезные данные не получены. Попробуй записать ещё раз.');
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        if (recording.current) finishRef.current(true);
        else if (controller.current) {
          controller.current.abort();
          setStatus('idle');
          setError('Запуск прерван: страница была скрыта.');
        }
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      controller.current?.abort();
      session.current?.stop();
      recording.current = false;
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  async function start() {
    setError('');
    setSaved(false);
    setResult(null);
    setConclusion('');
    buffer.current = [];
    setFrames([]);
    clipped.current = false;
    settings.current = { mode, hypothesis, hypothesisAt };
    setStatus('requesting');
    const ac = new AbortController();
    controller.current = ac;
    try {
      const active = await startAudio(
        mode,
        (frame) => {
          buffer.current.push(frame);
          setFrames([...buffer.current]);
          if (frame.t >= 15) finishRef.current();
        },
        () => finishRef.current(true),
        () => {
          clipped.current = true;
        },
        ac.signal,
      );
      if (ac.signal.aborted) {
        active.stop();
        return;
      }
      session.current = active;
      recording.current = true;
      setStatus('recording');
      setTone(440);
    } catch (e) {
      if (ac.signal.aborted) return;
      setStatus('idle');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Доступ к микрофону отклонён. Разреши его в настройках браузера или выбери демосигнал.'
          : e instanceof Error
            ? e.message
            : 'Не удалось запустить микрофон.',
      );
    } finally {
      if (controller.current === ac) controller.current = null;
    }
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
  const busy = status === 'recording' || status === 'requesting';
  const current = frames.at(-1);
  const number = (n: number | null | undefined, d = 0) =>
    n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: d });
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        Все исследования
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЛАБОРАТОРИЯ ЗВУКА · ОПЫТ 01</div>
          <h1>Увидь свой голос</h1>
          <p>Разберись, чем высота звука отличается от его громкости.</p>
        </div>
        <span className="pill">
          <AudioLines size={15} /> Микрофон · 3–5 мин
        </span>
      </div>
      <div className="lab-layout">
        <aside className="guide">
          <div className="step-label">
            <span>01</span>Предположи
          </div>
          <h2>Громче — значит выше?</h2>
          <p>Если произнести тот же звук громче, увеличится ли его частота?</p>
          <fieldset disabled={busy || !!result}>
            <legend className="sr-only">Твоя гипотеза</legend>
            {[
              'Да, частота увеличится',
              'Нет, изменится только уровень',
              'Пока не знаю — проверю',
            ].map((text) => (
              <label className={`choice ${hypothesis === text ? 'selected' : ''}`} key={text}>
                <input
                  type="radio"
                  name="hypothesis"
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
          <div className="guide-divider" />
          <div className="step-label">
            <span>02</span>Измерь
          </div>
          <ol className="instructions">
            <li>Положи телефон на стол в тихом месте.</li>
            <li>Произнеси протяжное «а», затем повтори громче, сохраняя высоту и расстояние.</li>
            <li>Сравни полосы на спектрограмме. Повтори со свистом.</li>
          </ol>
          <div className="tip">
            <FlaskConical size={18} />
            <p>
              Горизонтальная полоса — устойчивый тон. Чем выше она на графике, тем выше частота.
            </p>
          </div>
          <small>
            Данные обрабатываются на устройстве. Голос не сохраняется и не отправляется в сеть.
          </small>
        </aside>
        <div className="measurement">
          <div className="instrument">
            <div className="instrument-header">
              <span className="instrument-name">
                <AudioLines size={19} />
                Звуковой анализатор
              </span>
              <span className={`source-label ${mode === 'simulation' ? 'demo' : ''}`}>
                {mode === 'simulation' ? 'СИМУЛЯЦИЯ' : 'МИКРОФОН'} ·{' '}
                {status === 'recording'
                  ? 'ЗАПИСЬ'
                  : status === 'finished'
                    ? 'ЗАВЕРШЕНО'
                    : 'ГОТОВ К ЗАПУСКУ'}
              </span>
            </div>
            <Spectrum
              frames={frames}
              frequencyMax={result?.frequencyMax ?? session.current?.frequencyMax ?? 8000}
            />
            <div className="metrics">
              <div>
                <span>Доминирующая частота</span>
                <strong>
                  {number(current?.peakHz)} <small>Гц</small>
                </strong>
              </div>
              <div>
                <span>Относительный уровень</span>
                <strong>
                  {number(current?.rmsDb, 1)} <small>dBFS</small>
                </strong>
              </div>
              <div>
                <span>Время записи</span>
                <strong>
                  {number(current?.t ?? 0, 1)} <small>/ 15 с</small>
                </strong>
              </div>
            </div>
          </div>
          <div className="capture-controls">
            <div className="segmented" aria-label="Источник данных">
              <button
                disabled={busy}
                className={mode === 'live' ? 'active' : ''}
                onClick={() => {
                  setMode('live');
                  setFrames([]);
                  setResult(null);
                  setSaved(false);
                }}
              >
                <Mic size={16} />
                Микрофон
              </button>
              <button
                disabled={busy}
                className={mode === 'simulation' ? 'active' : ''}
                onClick={() => {
                  setMode('simulation');
                  setFrames([]);
                  setResult(null);
                  setSaved(false);
                }}
              >
                <FlaskConical size={16} />
                Демосигнал
              </button>
            </div>
            {status === 'recording' ? (
              <button className="primary" onClick={() => finish()}>
                <Square size={16} />
                Завершить запись
              </button>
            ) : status === 'requesting' ? (
              <button
                className="primary"
                onClick={() => {
                  controller.current?.abort();
                  setStatus('idle');
                }}
              >
                Отменить запуск
              </button>
            ) : (
              <button className="primary" disabled={!hypothesis} onClick={start}>
                <Play size={16} />
                {result ? 'Повторить опыт' : 'Начать запись'}
              </button>
            )}
          </div>
          {!hypothesis && (
            <p className="subtle">Сначала выбери гипотезу — затем проверим её экспериментом.</p>
          )}
          {mode === 'simulation' && (
            <div className="demo-control">
              <Volume2 size={18} />
              <label>
                Частота демосигнала: <b>{tone} Гц</b>
                <input
                  type="range"
                  min="150"
                  max="1800"
                  step="10"
                  value={tone}
                  disabled={status !== 'recording'}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setTone(value);
                    session.current?.setTone(value);
                  }}
                />
              </label>
              <span>Без звука из динамика</span>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <section className="result-card">
              <div className="step-label">
                <span>03</span>Объясни
              </div>
              <h2>
                {result.analysis.quality.status === 'invalid'
                  ? 'Эту запись стоит повторить'
                  : 'Что удалось измерить?'}
              </h2>
              <p>
                Медиана доминирующей частоты: <b>{number(result.analysis.peakHz)} Гц</b>. Это самый
                сильный спектральный компонент, который может отличаться от основной частоты голоса.
              </p>
              {result.analysis.quality.reasons.length > 0 ? (
                <ul className="quality-list">
                  {result.analysis.quality.reasons.map((code) => (
                    <li key={code}>{reasons[code]}</li>
                  ))}
                </ul>
              ) : (
                <p className="success">
                  <Check size={16} />
                  Достаточно данных для разбора спектра.
                </p>
              )}
              <p>
                Изменение громкости само по себе не требует изменения частоты. Сравни расположение
                полос и уровень. Этот опыт не измеряет уровень шума в dB SPL.
              </p>
              <label className="field-label" htmlFor="conclusion">
                Твой вывод
              </label>
              <textarea
                id="conclusion"
                maxLength={3000}
                placeholder="Что изменилось на графике? Подтвердилась ли твоя гипотеза?"
                value={conclusion}
                onChange={(e) => {
                  setConclusion(e.target.value);
                  setSaved(false);
                }}
              />
              <div className="result-actions">
                <button className="primary" disabled={saving || saved} onClick={save}>
                  {saved ? <Check size={16} /> : <Save size={16} />}{' '}
                  {saved
                    ? 'Сохранено в дневнике'
                    : saving
                      ? 'Сохраняем…'
                      : 'Сохранить исследование'}
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
              <details>
                <summary>Параметры измерения</summary>
                <p>
                  {result.sampleRate} отсчётов/с · FFT {result.fftSize} · шаг частот{' '}
                  {(result.sampleRate / result.fftSize).toFixed(2)} Гц. Шаг сетки не равен
                  гарантированной точности.
                </p>
                <p>
                  Анализ: {result.analysis.algorithmVersion}. График обновляется примерно 20 раз/с.
                </p>
              </details>
            </section>
          )}
          {!result && (
            <div className="next-question">
              <span>ЧТО ИССЛЕДУЕМ ДАЛЬШЕ</span>
              <p>
                Почему «а» и «у» звучат по-разному при одной высоте?
                <ArrowRight size={19} />
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
