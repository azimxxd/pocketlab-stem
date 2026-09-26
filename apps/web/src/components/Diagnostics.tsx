import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, Mic, Rotate3D, ShieldCheck } from 'lucide-react';
import { diagnoseMotion, type MotionReport } from '../acquisition/motion';
export function Diagnostics() {
  const [report, setReport] = useState<MotionReport | null>(null);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        ctrl.current?.abort();
        setRunning(false);
        setError('Проверка прервана. Оставь страницу открытой и повтори.');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      ctrl.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  async function check() {
    setRunning(true);
    setError('');
    setChecked(false);
    setReport(null);
    const ac = new AbortController();
    ctrl.current = ac;
    try {
      setReport(await diagnoseMotion(ac.signal, setReport));
      setChecked(true);
    } catch (e) {
      if (!ac.signal.aborted)
        setError(e instanceof Error ? e.message : 'Не удалось проверить датчики.');
    } finally {
      setRunning(false);
    }
  }
  const state = (works: boolean | undefined) =>
    works ? 'Получены данные' : checked ? 'Нет данных' : running ? 'Проверяем…' : 'Не проверен';
  return (
    <>
      <div className="eyebrow">ИНСТРУМЕНТЫ</div>
      <h1>Что умеет твоё устройство?</h1>
      <p className="intro">
        Проверь реальные показания перед экспериментом. Каждый датчик работает независимо.
      </p>
      <div className="diagnostic-grid">
        {[
          {
            icon: Activity,
            name: 'Акселерометр',
            works: report?.acceleration,
            desc: 'Ускорение по трём осям, включая гравитацию.',
          },
          {
            icon: Rotate3D,
            name: 'Гироскоп',
            works: report?.rotation,
            desc: 'Угловая скорость поворота телефона.',
          },
        ].map(({ icon: Icon, name, works, desc }) => (
          <article className="white-card" key={name}>
            <Icon size={28} />
            <h2>{name}</h2>
            <p>{desc}</p>
            <span className={`pill ${works ? 'good' : ''}`}>{state(works)}</span>
          </article>
        ))}
        <article className="white-card">
          <Mic size={28} />
          <h2>Микрофон</h2>
          <p>Проверяется при запуске записи в лаборатории звука.</p>
          <span className="pill">
            {typeof navigator.mediaDevices?.getUserMedia === 'function'
              ? 'API доступен · доступ не проверен'
              : 'Нужен HTTPS / поддержка браузера'}
          </span>
        </article>
      </div>
      <div className="white-card diagnostics-detail">
        <h2>Проверка движения</h2>
        <p>
          Нажми кнопку и слегка наклони телефон. За четыре секунды проверим поток и частоту событий.
        </p>
        <button className="primary" disabled={running} onClick={check}>
          {running ? 'Проверяем датчики…' : 'Проверить движение'}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {report && (
          <>
            <div className="diagnostic-values">
              <span>
                Событий <b>{report.count}</b>
              </span>
              <span>
                Частота <b>{report.hz.toFixed(1)} Гц</b>
              </span>
              <span>
                Модуль ускорения{' '}
                <b>
                  {report.sample?.accelerationWithGravity
                    ? Math.hypot(...Object.values(report.sample.accelerationWithGravity)).toFixed(2)
                    : '—'}{' '}
                  м/с²
                </b>
              </span>
            </div>
            {checked && !report.acceleration && !report.rotation && (
              <p>
                Данные не пришли. На компьютере датчиков может не быть. На телефоне попробуй открыть
                приложение непосредственно в Safari или Chrome.
              </p>
            )}
          </>
        )}
        <div className="note">
          <ShieldCheck size={20} />
          Разрешение браузера не гарантирует наличие датчика. Здесь показываются только реально
          полученные значения.
        </div>
      </div>
      <p className="subtle">
        <CheckCircle2 size={16} /> Для проверки микрофона открой «Увидь свой голос». Для телефона
        требуется HTTPS; обычный HTTP по адресу компьютера не подходит.
      </p>
    </>
  );
}
