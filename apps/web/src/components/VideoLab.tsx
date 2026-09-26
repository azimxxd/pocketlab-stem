import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FlaskConical,
  Ruler,
  Save,
  ScanLine,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import type { TrackPoint, VideoInvestigation } from '../../../../packages/contracts';
import {
  analyzeBounce,
  analyzeFlight,
  createFlightDemo,
  distancePx,
  type Px,
} from '../../../../packages/physics/kinematics';
import { parseDecimal } from '../../../../packages/physics/pendulum';
import { inspectVideo, seekFrame, type VideoInfo } from '../acquisition/video';
import { saveInvestigation, download } from '../storage/notebook';
import { setLeaveGuard } from '../platform/leave-guard';
import { VideoResults } from './video/VideoResults';
import { fmt } from './discovery/ModelDiscovery';
type Mode = 'flight' | 'bounce';
type Tool = 'mark' | 'scale1' | 'scale2';
const hypotheses: Record<Mode, { question: string; detail: string; options: string[] }> = {
  flight: {
    question: 'Как меняется скорость падающего мяча?',
    detail: 'Брось мяч или урони его. Что происходит со скоростью во время полёта?',
    options: [
      'Остаётся постоянной',
      'Растёт равномерно',
      'Растёт всё быстрее',
      'Пока не знаю — исследую',
    ],
  },
  bounce: {
    question: 'Какую часть высоты мяч вернёт?',
    detail: 'Урони мяч на пол. На какую высоту он подпрыгнет после первого удара?',
    options: [
      'На ту же высоту',
      'Примерно на половину',
      'Зависит от мяча и пола',
      'Пока не знаю — исследую',
    ],
  },
};
export function VideoLab({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>('flight');
  const [hypothesis, setHypothesis] = useState('');
  const [hypothesisAt, setHypothesisAt] = useState('');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState<'realtime' | 'slowmo' | 'unknown'>('unknown');
  const [slowFactor, setSlowFactor] = useState('8');
  const [frame, setFrame] = useState(0);
  const [tool, setTool] = useState<Tool>('mark');
  const [step, setStep] = useState(1);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [scale, setScale] = useState<{ p1: Px; p2: Px | null } | null>(null);
  const [lengthM, setLengthM] = useState('1');
  const [lengthErr, setLengthErr] = useState('0,002');
  const [clickErr, setClickErr] = useState('3');
  const [contactFrame, setContactFrame] = useState<number | null>(null);
  const [checks, setChecks] = useState({ verified: 0, mismatch: 0 });
  const [conclusion, setConclusion] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (info) URL.revokeObjectURL(info.url);
    },
    [info],
  );
  const dirty = points.length > 0 && !saved;
  useEffect(() => {
    setLeaveGuard(dirty ? 'Разметка видео не сохранена. Уйти и потерять отметки?' : null);
    return () => setLeaveGuard(null);
  }, [dirty]);
  const timeFactor =
    demo || speed === 'realtime'
      ? 1
      : speed === 'slowmo' && parseDecimal(slowFactor) >= 1
        ? parseDecimal(slowFactor)
        : null;
  const len = parseDecimal(lengthM),
    lenErr = parseDecimal(lengthErr),
    click = parseDecimal(clickErr);
  const scaleReady =
    scale?.p2 &&
    len > 0 &&
    lenErr >= 0 &&
    Number.isFinite(lenErr) &&
    distancePx(scale.p1, scale.p2) > 0;
  const segmentPx = scaleReady ? distancePx(scale!.p1, scale!.p2!) : 0;
  const metersPerPx = scaleReady ? len / segmentPx : null;
  const clickPx = click > 0 && click <= 50 ? click : 3;
  const timebaseKnown = demo || (info?.timebase === 'container' && checks.mismatch === 0);
  const flight = useMemo(
    () =>
      analyzeFlight(points, {
        metersPerPx,
        scaleRelBound: metersPerPx ? lenErr / len + (2 * clickPx) / segmentPx : 0,
        timeFactor,
        timebaseKnown,
        clickErrorPx: clickPx,
        simulation: demo,
      }),
    [points, metersPerPx, len, lenErr, clickPx, segmentPx, timeFactor, timebaseKnown, demo],
  );
  const bounce = useMemo(
    () =>
      mode === 'bounce'
        ? // h2/h1 is independent of a uniform time factor; only consistent frame times matter.
          analyzeBounce(points, contactFrame, { timebaseKnown, simulation: demo })
        : null,
    [mode, points, contactFrame, timebaseKnown, demo],
  );
  const current = points.find((p) => p.frame === frame);
  async function openFile(file: File) {
    setError('');
    setLoading(true);
    try {
      const next = await inspectVideo(file);
      setInfo(next);
      setDemo(false);
      setPoints([]);
      setScale(null);
      setContactFrame(null);
      setChecks({ verified: 0, mismatch: 0 });
      setFrame(0);
      setSaved(false);
      setTool('scale1');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть видео.');
    } finally {
      setLoading(false);
    }
  }
  function startDemo() {
    if (info) URL.revokeObjectURL(info.url);
    setInfo(null);
    setDemo(true);
    setMode('flight');
    setPoints(createFlightDemo());
    setScale({ p1: { x: 0, y: 0 }, p2: { x: 500, y: 0 } });
    setLengthM('1');
    setLengthErr('0,002');
    setContactFrame(null);
    setSaved(false);
    setError('');
  }
  // Show the selected frame and check it against the container table.
  useEffect(() => {
    const v = video.current;
    if (!v || !info) return;
    let cancelled = false;
    void seekFrame(v, info, frame).then((r) => {
      if (cancelled || r === 'unverified') return;
      setChecks((c) => ({ ...c, [r]: c[r] + 1 }));
    });
    return () => {
      cancelled = true;
    };
  }, [info, frame]);
  // Overlay: scale segment, marks and the current frame.
  useEffect(() => {
    const canvas = overlay.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !info) return;
    canvas.width = info.width;
    canvas.height = info.height;
    const r = Math.max(3, info.width / 160);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = Math.max(2, info.width / 400);
    if (scale) {
      ctx.strokeStyle = '#ffd166';
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(scale.p1.x, scale.p1.y, r, 0, 2 * Math.PI);
      ctx.fill();
      if (scale.p2) {
        ctx.beginPath();
        ctx.moveTo(scale.p1.x, scale.p1.y);
        ctx.lineTo(scale.p2.x, scale.p2.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(scale.p2.x, scale.p2.y, r, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    const sorted = [...points].sort((a, b) => a.t - b.t);
    ctx.strokeStyle = '#c2f77e88';
    ctx.beginPath();
    sorted.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    for (const p of sorted) {
      const active = p.frame === frame;
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? r * 1.8 : r, 0, 2 * Math.PI);
      ctx.strokeStyle = p.frame === contactFrame ? '#ffb347' : active ? '#ffffff' : '#c2f77e';
      ctx.setLineDash(p.uncertain ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [info, points, scale, frame, contactFrame]);
  function videoPoint(e: React.PointerEvent<HTMLCanvasElement>): Px | null {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!info) return null;
    // The overlay has the video's aspect ratio, so CSS pixels map linearly to video pixels.
    return {
      x: ((e.clientX - rect.left) / rect.width) * info.width,
      y: ((e.clientY - rect.top) / rect.height) * info.height,
    };
  }
  function onPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = videoPoint(e);
    if (!p || !info) return;
    setSaved(false);
    if (tool === 'scale1') {
      setScale({ p1: p, p2: null });
      setTool('scale2');
    } else if (tool === 'scale2' && scale) {
      setScale({ ...scale, p2: p });
      setTool('mark');
    } else if (tool === 'mark') {
      if (points.length >= 3000) return;
      const mark: TrackPoint = {
        frame,
        t: info.frameTimes[frame],
        x: p.x,
        y: p.y,
        uncertain: false,
      };
      setPoints([...points.filter((q) => q.frame !== frame), mark]);
      setFrame(Math.min(info.frameTimes.length - 1, frame + step));
    }
  }
  const go = (delta: number) =>
    info && setFrame(Math.max(0, Math.min(info.frameTimes.length - 1, frame + delta)));
  function build(): VideoInvestigation {
    return {
      schemaVersion: 2,
      scenarioId: 'video-01',
      scenarioVersion: 1,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      provenance: demo ? 'simulation' : 'imported',
      mode,
      hypothesis,
      hypothesisAt,
      conclusion,
      video: info
        ? {
            name: info.name.slice(0, 300),
            sizeBytes: info.sizeBytes,
            mimeType: info.mimeType.slice(0, 100),
            width: info.width,
            height: info.height,
            durationS: info.durationS,
            codec: info.codec,
            frameCount: info.frameTimes.length,
            timebase: timebaseKnown ? 'container' : 'unknown',
            timebaseIssues: [
              ...info.timebaseIssues,
              ...(checks.mismatch ? ['FRAME_TIME_MISMATCH'] : []),
            ].slice(0, 10),
            medianFrameIntervalS: info.medianFrameIntervalS,
            frameIntervalSpread: info.frameIntervalSpread,
          }
        : null,
      speed: demo ? 'realtime' : speed,
      timeFactor,
      scale:
        scaleReady && scale?.p2
          ? { p1: scale.p1, p2: scale.p2, lengthM: len, lengthErrorM: lenErr }
          : null,
      clickErrorPx: clickPx,
      points: [...points].sort((a, b) => a.t - b.t),
      contactFrame,
      flight,
      bounce,
    };
  }
  async function save() {
    setSaving(true);
    setError('');
    try {
      await saveInvestigation(build());
      setSaved(true);
      onSaved();
    } catch {
      setError('Не удалось сохранить разметку. Скачай JSON, чтобы не потерять её.');
    } finally {
      setSaving(false);
    }
  }
  const h = hypotheses[mode];
  const locked = points.length > 0;
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        Все исследования
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВИДЕОЛАБОРАТОРИЯ · ОПЫТ 01</div>
          <h1>{mode === 'flight' ? 'Поймай гравитацию' : 'Исследуй отскок'}</h1>
          <p>Сними движение мяча, отметь его по кадрам и найди закономерность.</p>
        </div>
        <div className="segmented" aria-label="Опыт">
          {(['flight', 'bounce'] as const).map((m) => (
            <button
              key={m}
              disabled={locked}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m);
                setHypothesis('');
              }}
            >
              {m === 'flight' ? 'Падение и бросок' : 'Отскок'}
            </button>
          ))}
        </div>
      </div>
      <div className="pendulum-intro">
        <div className="white-card hypothesis-card">
          <div className="step-label">
            <span>01</span>Предположи
          </div>
          <h2>{h.question}</h2>
          <p>{h.detail}</p>
          <fieldset disabled={locked}>
            {h.options.map((text) => (
              <label key={text} className={`choice ${hypothesis === text ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="video-hypothesis"
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
          <small>Прогноз фиксируется до разметки.</small>
        </div>
        <div className="setup-card">
          <svg
            viewBox="0 0 300 200"
            role="img"
            aria-label="Схема: телефон на неподвижной опоре снимает мяч; линейка находится в той же плоскости, что и движение."
          >
            <rect
              x="18"
              y="80"
              width="34"
              height="60"
              rx="6"
              fill="#f4f8f3"
              stroke="#284e3b"
              strokeWidth="3"
            />
            <path d="M52 110L120 70M52 110L120 150" stroke="#aec3b3" strokeDasharray="4 4" />
            <path d="M160 180H290" stroke="#718d7b" strokeWidth="3" />
            <path d="M270 40V180" stroke="#284e3b" strokeWidth="5" />
            {[50, 80, 110, 140, 170].map((y) => (
              <path key={y} d={`M262 ${y}H270`} stroke="#284e3b" />
            ))}
            {[40, 60, 88, 124, 168].map((y, i) => (
              <circle
                key={y}
                cx={190 + i * 12}
                cy={y}
                r="8"
                fill={i === 4 ? '#aadb83' : 'none'}
                stroke="#284e3b"
                strokeDasharray={i === 4 ? '' : '3 3'}
              />
            ))}
            <text x="6" y="160">
              телефон
            </text>
            <text x="228" y="30">
              линейка
            </text>
          </svg>
          <div>
            <h3>Камера неподвижна, линейка рядом с мячом</h3>
            <ol>
              <li>Закрепи телефон: на стопке книг или штативе. Держать в руке нельзя.</li>
              <li>
                Поставь линейку или предмет известной длины в той же плоскости, где летит мяч.
              </li>
              <li>
                Снимай при хорошем свете, мяч контрастный, движение поперёк кадра. До 30 секунд.
              </li>
            </ol>
            <p>Видео обрабатывается только на устройстве и не сохраняется в дневник.</p>
          </div>
        </div>
      </div>
      <section className="white-card timing-card">
        <div className="step-label">
          <span>02</span>Видео
        </div>
        <div className="timer-row">
          <button
            className="primary"
            disabled={!hypothesis || loading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} />
            {loading
              ? 'Проверяем ролик…'
              : info
                ? 'Выбрать другое видео'
                : 'Выбрать или снять видео'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            hidden
            aria-label="Видеофайл"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void openFile(file);
            }}
          />
          {mode === 'flight' && (
            <button className="secondary" disabled={!hypothesis || loading} onClick={startDemo}>
              <FlaskConical size={16} />
              Учебная разметка
            </button>
          )}
          <span>MP4 или MOV с камеры телефона, до 30 с и 100 МБ.</span>
        </div>
        {!hypothesis && <p className="subtle">Сначала выбери гипотезу.</p>}
        {info && (
          <div className="video-info">
            <div>
              <span>Кадр</span>
              <b>
                {info.width}×{info.height}
              </b>
            </div>
            <div>
              <span>Длительность</span>
              <b>{fmt(info.durationS, 2)} с</b>
            </div>
            <div>
              <span>Кадров</span>
              <b>{info.frameTimes.length}</b>
            </div>
            <div>
              <span>Интервал кадров</span>
              <b>
                {info.medianFrameIntervalS
                  ? `${fmt(info.medianFrameIntervalS * 1000, 1)} мс`
                  : 'неизвестен'}
                {info.frameIntervalSpread !== null &&
                  info.frameIntervalSpread > 0.1 &&
                  ' · переменный'}
              </b>
            </div>
            <div>
              <span>Время кадров</span>
              <b>{info.timebase === 'container' ? 'из файла' : 'неизвестно'}</b>
            </div>
            <div>
              <span>Проверка кадров</span>
              <b>
                {checks.verified + checks.mismatch
                  ? `${checks.verified} совпали · ${checks.mismatch} расхождений`
                  : 'не проводилась'}
              </b>
            </div>
          </div>
        )}
        {info && info.timebase === 'unknown' && (
          <p className="measurement-warning">
            Точное время кадров в этом файле не установлено ({info.timebaseIssues.join(', ')}).
            Разметка возможна, но ускорение считаться не будет. Сними ролик стандартной камерой
            телефона в MP4/MOV.
          </p>
        )}
        {checks.mismatch > 0 && (
          <p className="measurement-warning">
            Показанный кадр не совпал с таблицей времени файла. Ускорение отключено: время отметок
            может быть неверным.
          </p>
        )}
        {info && (
          <fieldset className="speed-choice">
            <legend>С какой скоростью снят ролик?</legend>
            {(
              [
                ['realtime', 'Обычная съёмка (не замедленная)'],
                ['slowmo', 'Замедленная съёмка'],
                ['unknown', 'Не знаю'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`choice ${speed === value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="video-speed"
                  checked={speed === value}
                  onChange={() => {
                    setSpeed(value);
                    setSaved(false);
                  }}
                />
                {label}
              </label>
            ))}
            {speed === 'slowmo' && (
              <label className="inline-field">
                Во сколько раз замедлено
                <input
                  aria-label="Коэффициент замедления"
                  inputMode="decimal"
                  value={slowFactor}
                  onChange={(e) => setSlowFactor(e.target.value)}
                />
              </label>
            )}
            <small>
              Без известной скорости воспроизведения время кадров не переводится в реальное — тогда
              ускорение не считается.
            </small>
          </fieldset>
        )}
      </section>
      {info && (
        <section className="white-card video-workspace">
          <div className="step-label">
            <span>03</span>Отметь
          </div>
          <div className="video-tools">
            <div className="segmented" aria-label="Инструмент">
              <button className={tool !== 'mark' ? 'active' : ''} onClick={() => setTool('scale1')}>
                <Ruler size={16} />
                Масштаб
              </button>
              <button className={tool === 'mark' ? 'active' : ''} onClick={() => setTool('mark')}>
                <Target size={16} />
                Мяч
              </button>
            </div>
            <span className="tool-hint" role="status">
              {tool === 'scale1'
                ? 'Нажми на первый конец линейки.'
                : tool === 'scale2'
                  ? 'Нажми на второй конец линейки.'
                  : 'Нажми на центр мяча на этом кадре.'}
            </span>
          </div>
          <div
            className="video-stage"
            style={{
              aspectRatio: `${info.width} / ${info.height}`,
              width: `min(100%, calc(70vh * ${info.width / info.height}))`,
            }}
          >
            <video ref={video} src={info.url} muted playsInline preload="auto" />
            <canvas
              ref={overlay}
              onPointerDown={onPointer}
              aria-label="Кадр видео. Нажатие ставит отметку выбранного инструмента."
            />
          </div>
          <div className="frame-controls">
            <button className="icon-button" aria-label="Назад на 5 кадров" onClick={() => go(-5)}>
              <ChevronsLeft size={18} />
            </button>
            <button className="icon-button" aria-label="Предыдущий кадр" onClick={() => go(-1)}>
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Кадр"
              type="range"
              min={0}
              max={info.frameTimes.length - 1}
              value={frame}
              onChange={(e) => setFrame(Number(e.target.value))}
            />
            <button className="icon-button" aria-label="Следующий кадр" onClick={() => go(1)}>
              <ChevronRight size={18} />
            </button>
            <button className="icon-button" aria-label="Вперёд на 5 кадров" onClick={() => go(5)}>
              <ChevronsRight size={18} />
            </button>
            <span className="frame-label">
              Кадр {frame + 1}/{info.frameTimes.length} · {fmt(info.frameTimes[frame], 3)} с
            </span>
          </div>
          <div className="frame-controls">
            <label className="inline-field">
              Шаг после отметки
              <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} кадр{n === 1 ? '' : n < 5 ? 'а' : 'ов'}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field checkbox">
              <input
                type="checkbox"
                disabled={!current}
                checked={!!current?.uncertain}
                onChange={(e) =>
                  setPoints(
                    points.map((p) =>
                      p.frame === frame ? { ...p, uncertain: e.target.checked } : p,
                    ),
                  )
                }
              />
              Отметка сомнительная
            </label>
            <button
              className="text-button"
              disabled={!current}
              onClick={() => {
                setPoints(points.filter((p) => p.frame !== frame));
                if (contactFrame === frame) setContactFrame(null);
                setSaved(false);
              }}
            >
              <Trash2 size={15} />
              Удалить отметку
            </button>
            {mode === 'bounce' && (
              <button
                className="secondary"
                disabled={!current}
                onClick={() => {
                  setContactFrame(frame);
                  setSaved(false);
                }}
              >
                <ScanLine size={15} />
                {contactFrame === frame ? 'Кадр касания' : 'Касание на этом кадре'}
              </button>
            )}
          </div>
          <fieldset className="measurement-fields">
            <label>
              Длина отрезка масштаба, м
              <input
                aria-label="Длина отрезка масштаба, м"
                inputMode="decimal"
                value={lengthM}
                onChange={(e) => setLengthM(e.target.value)}
              />
            </label>
            <label>
              Граница ошибки длины, м
              <input
                aria-label="Граница ошибки длины, м"
                inputMode="decimal"
                value={lengthErr}
                onChange={(e) => setLengthErr(e.target.value)}
              />
            </label>
            <label>
              Точность отметки, пикс. кадра
              <input
                aria-label="Точность отметки, пикс. кадра"
                inputMode="decimal"
                value={clickErr}
                onChange={(e) => setClickErr(e.target.value)}
              />
            </label>
          </fieldset>
          <p className="subtle">
            {scaleReady
              ? `Масштаб: ${fmt(segmentPx, 0)} пикс. = ${fmt(len, 3)} м (${fmt((len / segmentPx) * 1000, 3)} мм/пикс.).`
              : 'Масштаб не задан.'}{' '}
            Отметок: {points.length}.
          </p>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {demo && (
        <div className="simulation-banner">
          <FlaskConical size={22} />
          <div>
            <b>Учебная разметка · симуляция</b>
            <p>
              16 отметок брошенного мяча, 30 кадров/с, 1 пикс. = 2 мм, сгенерированы с g = 9,81 м/с²
              и шумом ±1 пикс. Видео нет — это не измерение.
            </p>
          </div>
        </div>
      )}
      {points.length >= 2 && (
        <>
          <VideoResults
            mode={mode}
            points={points}
            flight={flight}
            bounce={bounce}
            metersPerPx={metersPerPx}
            timeFactor={timeFactor}
            contactT={points.find((p) => p.frame === contactFrame)?.t}
          />
          <section className="white-card conclusion-card">
            <div className="step-label">
              <span>04</span>Объясни
            </div>
            <h2>Какой вывод ты сделаешь?</h2>
            <p>
              Подтвердилась ли гипотеза «{hypothesis}»? Что ограничивает точность: время кадров,
              масштаб, перспектива или разметка?
            </p>
            <label className="field-label" htmlFor="video-conclusion">
              Вывод исследования
            </label>
            <textarea
              id="video-conclusion"
              value={conclusion}
              maxLength={3000}
              disabled={saving}
              onChange={(e) => {
                setConclusion(e.target.value);
                setSaved(false);
              }}
              placeholder="По графику видно… Ускорение… Мою гипотезу…"
            />
            <div className="result-actions">
              <button className="primary" disabled={saving || saved || !hypothesis} onClick={save}>
                {saved ? <Check size={17} /> : <Save size={17} />}{' '}
                {saved ? 'Сохранено в дневнике' : saving ? 'Сохраняем…' : 'Сохранить разметку'}
              </button>
              <button className="secondary" onClick={() => download(build(), 'json')}>
                <Download size={16} />
                JSON
              </button>
              <button className="secondary" onClick={() => download(build(), 'csv')}>
                CSV
              </button>
            </div>
            <p className="subtle">
              В дневник попадают отметки, масштаб и сведения о файле. Само видео не сохраняется.
            </p>
          </section>
        </>
      )}
    </>
  );
}
