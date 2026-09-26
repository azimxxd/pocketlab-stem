import { useEffect, useState } from 'react';
import { BookOpen, Download, Trash2, ArrowLeft, Play, Pause } from 'lucide-react';
import type { NotebookRecord, PendulumInvestigation } from '../../../../packages/contracts';
import {
  listInvestigations,
  deleteInvestigation,
  download,
  downloadUnreadable,
  storagePersisted,
} from '../storage/notebook';
import { Spectrum } from './Spectrum';
import { PendulumResults } from './PendulumResults';
export function Notebook({
  onStart,
  onChange,
  onResume,
}: {
  onStart: () => void;
  onChange: () => void;
  onResume: (record: PendulumInvestigation) => void;
}) {
  const [items, setItems] = useState<NotebookRecord[]>([]);
  const [unreadable, setUnreadable] = useState<unknown[]>([]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NotebookRecord | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
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
  if (selected?.scenarioId === 'pendulum-01')
    return (
      <>
        <button className="back" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} />
          Дневник
        </button>
        <div className="eyebrow">
          СОХРАНЁННАЯ СЕРИЯ ·{' '}
          {selected.provenance === 'simulation' ? 'СИМУЛЯЦИЯ' : 'РУЧНЫЕ ИЗМЕРЕНИЯ'} · ВЕРСИЯ{' '}
          {selected.revision}
        </div>
        <h1>Открой закон маятника</h1>
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
        <PendulumResults trials={selected.trials} events={selected.selectionEvents} />
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
        <span className="pill">{items.length} записей</span>
      </div>
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
                  {item.provenance === 'simulation'
                    ? 'СИМУЛЯЦИЯ'
                    : item.scenarioId === 'pendulum-01'
                      ? 'РУЧНОЕ ИЗМЕРЕНИЕ'
                      : 'МИКРОФОН'}{' '}
                  · {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                </span>
                <h2>
                  {item.scenarioId === 'pendulum-01' ? 'Открой закон маятника' : 'Увидь свой голос'}
                </h2>
                <p>{item.hypothesis}</p>
                <span>
                  {item.scenarioId === 'pendulum-01'
                    ? `${item.trials.length} попыток · версия ${item.revision}`
                    : `${item.analysis.peakHz?.toFixed(0) ?? '—'} Гц · ${item.analysis.duration.toFixed(1)} с`}
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
