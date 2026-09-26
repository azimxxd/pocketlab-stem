import { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Trash2, ArrowLeft, Play, Pause, Upload } from 'lucide-react';
import type {
  BottleInvestigation,
  NotebookRecord,
  PendulumInvestigation,
} from '../../../../packages/contracts';
import {
  listInvestigations,
  deleteInvestigation,
  download,
  downloadUnreadable,
  importRecords,
  storagePersisted,
} from '../storage/notebook';
import { Spectrum } from './Spectrum';
import { PendulumResults } from './PendulumResults';
import { BottleResults } from './BottleResults';
import { MotionReview } from './MotionReview';
import { VideoResults } from './video/VideoResults';
import { fmt } from './discovery/ModelDiscovery';
export const scenarioTitles: Record<NotebookRecord['scenarioId'], string> = {
  'sound-01': 'Увидь свой голос',
  'pendulum-01': 'Открой закон маятника',
  'bottle-01': 'Собери музыкальный инструмент',
  'motion-01': 'Что чувствует телефон?',
  'video-01': 'Видео: гравитация и отскок',
};
function sourceLabel(item: NotebookRecord) {
  if (item.provenance === 'simulation') return 'СИМУЛЯЦИЯ';
  if (item.scenarioId === 'pendulum-01') return 'РУЧНЫЕ ИЗМЕРЕНИЯ';
  if (item.scenarioId === 'motion-01') return 'ДАТЧИКИ';
  if (item.scenarioId === 'video-01') return 'РАЗМЕТКА ВИДЕО';
  return item.provenance === 'manual' ? 'РУЧНОЙ ВВОД' : 'МИКРОФОН';
}
export function Notebook({
  onStart,
  onChange,
  onResume,
}: {
  onStart: () => void;
  onChange: () => void;
  onResume: (record: PendulumInvestigation | BottleInvestigation) => void;
}) {
  const [items, setItems] = useState<NotebookRecord[]>([]);
  const [unreadable, setUnreadable] = useState<unknown[]>([]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NotebookRecord | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  async function importFile(file: File) {
    setError('');
    setNotice('');
    try {
      const result = await importRecords(file);
      await load();
      onChange();
      setNotice(
        [
          `Импортировано: ${result.imported}.`,
          result.duplicates ? `Уже были в дневнике: ${result.duplicates}.` : '',
          result.copies
            ? `Сохранено копией, потому что в дневнике есть другая версия с тем же ID: ${result.copies}.`
            : '',
          result.invalid ? `Не прошли проверку и пропущены: ${result.invalid}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось импортировать файл.');
    }
  }
  async function load() {
    try {
      const { records, unreadable } = await listInvestigations();
      setItems(records);
      setUnreadable(unreadable);
    } catch {
      setError('Локальный дневник недоступен. Проверь настройки хранилища браузера.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void storagePersisted().then(setPersisted);
  }, []);
  useEffect(() => {
    if (!playing || !selected || selected.scenarioId !== 'sound-01') return;
    const start = performance.now();
    const initialTime = selected.frames[cursor]?.t ?? 0;
    const timer = setInterval(() => {
      const t = initialTime + (performance.now() - start) / 1000;
      const next = selected.frames.findIndex((f) => f.t >= t);
      if (next === -1) {
        setCursor(selected.frames.length - 1);
        setPlaying(false);
      } else setCursor(next);
    }, 40);
    return () => clearInterval(timer);
  }, [playing, selected]);
  async function remove(item: NotebookRecord) {
    if (!window.confirm('Удалить это исследование из дневника?')) return;
    try {
      await deleteInvestigation(item.id);
      await load();
      onChange();
    } catch {
      setError('Не удалось удалить запись. Попробуй ещё раз.');
    }
  }
  if (selected?.scenarioId === 'video-01')
    return (
      <>
        <button className="back" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} />
          Дневник
        </button>
        <div className="eyebrow">СОХРАНЁННАЯ РАЗМЕТКА · {sourceLabel(selected)}</div>
        <h1>{selected.mode === 'flight' ? 'Поймай гравитацию' : 'Исследуй отскок'}</h1>
        <p className="intro">
          {new Date(selected.createdAt).toLocaleString('ru-RU')}
          {selected.video &&
            ` · ${selected.video.name} · ${selected.video.width}×${selected.video.height} · время кадров: ${selected.video.timebase === 'container' ? 'из файла' : 'неизвестно'}`}
        </p>
        <div className="white-card">
          <h2>Гипотеза</h2>
          <p>{selected.hypothesis}</p>
          <h2>Твой вывод</h2>
          <p>{selected.conclusion || 'Вывод ещё не записан.'}</p>
          <div className="result-actions">
            <button className="secondary" onClick={() => download(selected, 'json')}>
              <Download size={16} />
              JSON
            </button>
            <button className="secondary" onClick={() => download(selected, 'csv')}>
              CSV
            </button>
          </div>
          <p className="subtle">Видео не сохранялось: здесь только отметки, масштаб и анализ.</p>
        </div>
        <VideoResults
          mode={selected.mode}
          points={selected.points}
          flight={selected.flight}
          bounce={selected.bounce}
          metersPerPx={
            selected.scale
              ? selected.scale.lengthM /
                Math.hypot(
                  selected.scale.p2.x - selected.scale.p1.x,
                  selected.scale.p2.y - selected.scale.p1.y,
                )
              : null
          }
          timeFactor={selected.timeFactor}
          contactT={selected.points.find((p) => p.frame === selected.contactFrame)?.t}
        />
      </>
    );
  if (selected?.scenarioId === 'motion-01')
    return (
      <>
        <button className="back" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} />
          Дневник
        </button>
        <div className="eyebrow">СОХРАНЁННАЯ ЗАПИСЬ · {sourceLabel(selected)}</div>
        <h1>{scenarioTitles[selected.scenarioId]}</h1>
        <p className="intro">{new Date(selected.createdAt).toLocaleString('ru-RU')}</p>
        <div className="white-card">
          <h2>Гипотеза</h2>
          <p>{selected.hypothesis}</p>
          <h2>Твой вывод</h2>
          <p>{selected.conclusion || 'Вывод ещё не записан.'}</p>
          <div className="result-actions">
            <button className="secondary" onClick={() => download(selected, 'json')}>
              <Download size={16} />
              JSON
            </button>
            <button className="secondary" onClick={() => download(selected, 'csv')}>
              CSV
            </button>
          </div>
        </div>
        <MotionReview
          samples={selected.samples}
          analysis={selected.analysis}
          simulated={selected.provenance === 'simulation'}
        />
      </>
    );
  if (selected && selected.scenarioId !== 'sound-01')
    return (
      <>
        <button className="back" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} />
          Дневник
        </button>
        <div className="eyebrow">
          СОХРАНЁННАЯ СЕРИЯ · {sourceLabel(selected)} · ВЕРСИЯ {selected.revision}
        </div>
        <h1>{scenarioTitles[selected.scenarioId]}</h1>
        <p className="intro">{new Date(selected.updatedAt).toLocaleString('ru-RU')}</p>
        <div className="white-card">
          <h2>Гипотеза</h2>
          <p>{selected.hypothesis}</p>
          <h2>Твой вывод</h2>
          <p>{selected.conclusion || 'Вывод ещё не записан.'}</p>
          <div className="result-actions">
            <button className="primary" onClick={() => onResume(selected)}>
              Продолжить исследование
            </button>
            <button className="secondary" onClick={() => download(selected, 'json')}>
              <Download size={16} />
              JSON
            </button>
            <button className="secondary" onClick={() => download(selected, 'csv')}>
              CSV
            </button>
          </div>
        </div>
        {selected.scenarioId === 'pendulum-01' ? (
          <PendulumResults trials={selected.trials} events={selected.selectionEvents} />
        ) : (
          <BottleResults trials={selected.trials} events={selected.selectionEvents} />
        )}
        <details className="method-details">
          <summary>Версии анализа ({selected.analyses.length})</summary>
          <ul>
            {selected.analyses.map((a) => (
              <li key={a.id}>
                Версия {a.revision} · {new Date(a.at).toLocaleString('ru-RU')} ·{' '}
                {a.result.inputTrialIds.length} попыток · {a.result.algorithmVersion}
                {a.conclusion && <p>{a.conclusion}</p>}
              </li>
            ))}
          </ul>
        </details>
      </>
    );
  if (selected)
    return (
      <>
        <button
          className="back"
          onClick={() => {
            setSelected(null);
            setPlaying(false);
          }}
        >
          <ArrowLeft size={16} />
          Дневник
        </button>
        <div className="eyebrow">
          СОХРАНЁННАЯ ЗАПИСЬ · {selected.provenance === 'simulation' ? 'СИМУЛЯЦИЯ' : 'МИКРОФОН'}
        </div>
        <h1>Увидь свой голос</h1>
        <p className="intro">{new Date(selected.createdAt).toLocaleString('ru-RU')}</p>
        <div className="instrument">
          <Spectrum
            frames={selected.frames.slice(0, cursor + 1)}
            frequencyMax={selected.frequencyMax}
          />
        </div>
        <div className="replay">
          <button
            className="secondary"
            onClick={() => {
              if (cursor === selected.frames.length - 1) setCursor(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}{' '}
            {playing ? 'Пауза' : 'Воспроизвести график'}
          </button>
          <label>
            Время: {selected.frames[cursor]?.t.toFixed(1)} с
            <input
              aria-label="Позиция записи"
              type="range"
              min={0}
              max={selected.frames.length - 1}
              value={cursor}
              onChange={(e) => {
                setPlaying(false);
                setCursor(Number(e.target.value));
              }}
            />
          </label>
        </div>
        <div className="white-card">
          <h2>Гипотеза</h2>
          <p>{selected.hypothesis}</p>
          <h2>Твой вывод</h2>
          <p>{selected.conclusion || 'Вывод ещё не записан.'}</p>
          <p className="subtle">
            Воспроизводится спектральная визуализация. Аудио не сохранялось. Качество записи:{' '}
            {selected.analysis.quality.status === 'valid'
              ? 'данные пригодны'
              : selected.analysis.quality.status === 'warning'
                ? 'есть ограничения'
                : 'запись требует повтора'}
            .
          </p>
          <div className="result-actions">
            <button className="secondary" onClick={() => download(selected, 'json')}>
              <Download size={16} />
              JSON
            </button>
            <button className="secondary" onClick={() => download(selected, 'csv')}>
              CSV
            </button>
          </div>
        </div>
      </>
    );
  return (
    <>
      <div className="eyebrow">ТВОИ ОТКРЫТИЯ</div>
      <div className="page-heading">
        <div>
          <h1>Дневник исследователя</h1>
          <p>Гипотезы, измерения и выводы — всё в одном месте.</p>
        </div>
        <div className="result-actions">
          <span className="pill">{items.length} записей</span>
          <button className="secondary" onClick={() => fileInput.current?.click()}>
            <Upload size={16} />
            Импорт JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Файл исследования JSON"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {unreadable.length > 0 && (
        <div className="error" role="alert">
          {unreadable.length === 1
            ? 'Одну запись не удалось прочитать'
            : `Записей, которые не удалось прочитать: ${unreadable.length}`}
          . Возможно, она повреждена или создана другой версией приложения. Запись не удалена.{' '}
          <button className="text-button" onClick={() => downloadUnreadable(unreadable)}>
            Скачать как есть
          </button>
        </div>
      )}
      {loading ? (
        <p>Открываем дневник…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={40} />
          <h2>Первое открытие ещё впереди</h2>
          <p>Проведи опыт и сохрани результат — он появится здесь.</p>
          <button className="primary" onClick={onStart}>
            Исследовать звук
          </button>
        </div>
      ) : (
        <div className="notebook-list">
          {items.map((item) => (
            <article className="white-card notebook-item" key={item.id}>
              <div>
                <span className="eyebrow">
                  {sourceLabel(item)} · {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                </span>
                <h2>{scenarioTitles[item.scenarioId]}</h2>
                <p>{item.hypothesis}</p>
                <span>
                  {item.scenarioId === 'sound-01'
                    ? `${item.analysis.peakHz?.toFixed(0) ?? '—'} Гц · ${item.analysis.duration.toFixed(1)} с`
                    : item.scenarioId === 'video-01'
                      ? item.mode === 'flight'
                        ? `${item.points.length} отметок · g ${item.flight.g !== null ? `≈ ${fmt(item.flight.g, 2)} м/с²` : 'не оценено'}`
                        : `${item.points.length} отметок · h₂/h₁ ${item.bounce?.ratio != null ? fmt(item.bounce.ratio, 2) : '—'}`
                      : item.scenarioId === 'motion-01'
                        ? `${item.analysis.durationS.toFixed(1)} с · ${item.analysis.movements.length} движений`
                        : `${item.trials.length} попыток · версия ${item.revision}`}
                </span>
              </div>
              <div className="result-actions">
                <button
                  className="primary"
                  onClick={() => {
                    setSelected(item);
                    if (item.scenarioId === 'sound-01') setCursor(item.frames.length - 1);
                  }}
                >
                  Открыть
                </button>
                <button
                  className="icon-button"
                  aria-label="Скачать исследование"
                  onClick={() => download(item, 'json')}
                >
                  <Download size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Удалить исследование"
                  onClick={() => remove(item)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="subtle">
        {persisted
          ? 'Дневник хранится только на этом устройстве, и браузер не удалит его автоматически. Экспорт — твоя резервная копия.'
          : 'Дневник хранится только в этом браузере. Браузер может очистить данные сайта при нехватке места или долгом перерыве (особенно Safari) — экспортируй важные записи.'}
      </p>
    </>
  );
}
