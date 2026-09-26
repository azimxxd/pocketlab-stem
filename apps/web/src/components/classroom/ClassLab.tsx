import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Download,
  Lock,
  MonitorUp,
  Play,
  Send,
  Trash2,
  Unlock,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  CLASS_LIMITS,
  roomCodeSchema,
  type RoomSnapshot,
  type RoomState,
  type SubmissionInput,
} from '../../../../../packages/contracts/classroom';
import { pendulumInputSchema, type PendulumTrial } from '../../../../../packages/contracts';
import { analyzePendulum, parseDecimal } from '../../../../../packages/physics/pendulum';
import { ClassApiError, type StreamStatus } from '../../classroom/client';
import { classApi, joinUrl, screenUrl } from '../../classroom/config';
import {
  forgetTeacherRoom,
  outbox,
  saveOutbox,
  saveStudentRoom,
  saveTeacherRoom,
  studentRoom,
  teacherRooms,
  type Outgoing,
} from '../../classroom/local';
import { listInvestigations } from '../../storage/notebook';
import { saveFile } from '../../platform/save-file';
import { fmt } from '../discovery/ModelDiscovery';
import { ClassBoard } from './ClassBoard';
import { QrCode } from './QrCode';
const stateNames: Record<RoomState, string> = {
  lobby: 'Сбор участников',
  collecting: 'Идёт сбор результатов',
  discussing: 'Обсуждение',
  closed: 'Занятие завершено',
};
const LENGTHS = [0.2, 0.35, 0.5, 0.75, 1];
const go = (hash: string) => {
  location.hash = hash;
};
const message = (e: unknown) =>
  e instanceof ClassApiError
    ? e.message
    : 'Сервер класса недоступен. Проверь интернет и попробуй ещё раз.';
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '').split('/').slice(1);
}
/** Live room snapshot over the event stream, with connection status and end reason. */
function useRoom(code: string, token: string | undefined) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [ended, setEnded] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    return classApi.subscribe(code, token, {
      snapshot: setSnap,
      status: setStatus,
      end: (reason) =>
        setEnded(
          reason === 'deleted'
            ? 'Учитель удалил занятие.'
            : reason === 'revoked'
              ? 'Учитель убрал тебя из комнаты.'
              : reason === 'not-found'
                ? 'Комната не найдена или уже удалена.'
                : 'Нет доступа к этой комнате с этого устройства.',
        ),
    });
  }, [code, token]);
  return { snap, setSnap, status, ended };
}
function Connection({ status }: { status: StreamStatus }) {
  return (
    <span className={`pill connection ${status === 'live' ? 'good' : ''}`} role="status">
      {status === 'live' ? <Wifi size={15} /> : <WifiOff size={15} />}
      {status === 'live'
        ? 'На связи'
        : status === 'ended'
          ? 'Отключено'
          : status === 'reconnecting'
            ? 'Переподключение…'
            : 'Подключение…'}
    </span>
  );
}
export function ClassLab() {
  const [view, a, b] = useRoute();
  if (view === 'teach' && a) return <TeacherRoom code={a} />;
  if (view === 'room' && a) return <StudentRoom code={a} />;
  if (view === 'screen' && a && b) return <ClassScreen code={a} token={b} />;
  return <ClassHome joinCode={view === 'join' ? a : undefined} />;
}
function ClassHome({ joinCode }: { joinCode?: string }) {
  const [title, setTitle] = useState('');
  const [code, setCode] = useState(joinCode ?? '');
  const [pseudonym, setPseudonym] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = teacherRooms();
  const current = studentRoom();
  async function create() {
    setBusy(true);
    setError('');
    try {
      const room = await classApi.createRoom(title.trim());
      saveTeacherRoom({
        code: room.code,
        title: room.snapshot.title,
        ownerToken: room.ownerToken,
        viewerToken: room.viewerToken,
        createdAt: room.snapshot.createdAt,
      });
      go(`class/teach/${room.code}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function enter() {
    const parsed = roomCodeSchema.safeParse(code.trim().toUpperCase());
    if (!parsed.success) return setError('Код комнаты — 6 символов, например K7M2QX.');
    setBusy(true);
    setError('');
    try {
      const joined = await classApi.join(parsed.data, pseudonym.trim());
      saveStudentRoom({
        code: parsed.data,
        token: joined.participantToken,
        pseudonym: joined.snapshot.me!.pseudonym,
      });
      go(`class/room/${parsed.data}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">СОВМЕСТНОЕ ИССЛЕДОВАНИЕ</div>
          <h1>Класс</h1>
          <p>Один телефон — одна точка. Весь класс — общий закон на одном графике.</p>
        </div>
        <span className="pill">
          <Users size={16} />
          До {CLASS_LIMITS.participants} участников
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="class-grid">
        <section className="white-card">
          <div className="step-label">
            <span>У</span>Я учитель
          </div>
          <h2>Открыть занятие «Маятник»</h2>
          <p>
            Ученики войдут по QR-коду, ты распределишь длины нити, а результаты появятся на общем
            экране.
          </p>
          <label className="field-label" htmlFor="class-title">
            Название (необязательно)
          </label>
          <input
            id="class-title"
            className="text-input"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: 9Б, физика"
          />
          <div className="result-actions">
            <button className="primary" disabled={busy} onClick={create}>
              <Play size={16} />
              Создать занятие
            </button>
          </div>
          {mine.length > 0 && (
            <ul className="class-list">
              {mine.map((r) => (
                <li key={r.code}>
                  <button className="text-button" onClick={() => go(`class/teach/${r.code}`)}>
                    {r.code} · {r.title || 'без названия'} ·{' '}
                    {new Date(r.createdAt).toLocaleString('ru-RU')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="white-card">
          <div className="step-label">
            <span>Я</span>Я ученик
          </div>
          <h2>Войти в класс</h2>
          <p>Введи код с экрана учителя и псевдоним. Настоящее имя писать не нужно.</p>
          <label className="field-label" htmlFor="class-code">
            Код комнаты
          </label>
          <input
            id="class-code"
            className="text-input code-input"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7M2QX"
          />
          <label className="field-label" htmlFor="class-name">
            Псевдоним
          </label>
          <input
            id="class-name"
            className="text-input"
            maxLength={24}
            value={pseudonym}
            onChange={(e) => setPseudonym(e.target.value)}
            placeholder="Например: Группа 3"
          />
          <div className="result-actions">
            <button className="primary" disabled={busy || !pseudonym.trim()} onClick={enter}>
              Войти
            </button>
            {current && (
              <button className="secondary" onClick={() => go(`class/room/${current.code}`)}>
                Вернуться в {current.code}
              </button>
            )}
          </div>
        </section>
      </div>
      <p className="subtle">
        На сервер отправляются только псевдоним и числа твоих измерений — без звука, видео и имени.
        Занятие принимает результаты 2 часа, данные удаляются через 7 дней; учитель может удалить их
        раньше.
      </p>
    </>
  );
}
function TeacherRoom({ code }: { code: string }) {
  const ref = teacherRooms().find((r) => r.code === code);
  const { snap, setSnap, status, ended } = useRoom(code, ref?.ownerToken);
  const [error, setError] = useState('');
  const [lengths, setLengths] = useState<Record<string, string>>({});
  if (!ref)
    return (
      <div className="white-card">
        <h1>Нет прав учителя на этом устройстве</h1>
        <p>Управлять занятием можно только с устройства, на котором оно создано.</p>
        <button className="secondary" onClick={() => go('class')}>
          К классу
        </button>
      </div>
    );
  const run = async (cmd: Parameters<typeof classApi.command>[2]) => {
    setError('');
    try {
      setSnap(await classApi.command(code, ref.ownerToken, cmd));
    } catch (e) {
      setError(message(e));
    }
  };
  async function distribute() {
    const free = (snap?.participants ?? []).filter((p) => !p.condition);
    for (const [i, p] of free.entries())
      await run({
        type: 'assign',
        participantId: p.id,
        condition: { lengthM: LENGTHS[i % LENGTHS.length] },
      });
  }
  async function exportRoom() {
    try {
      const data = await classApi.exportRoom(code, ref!.ownerToken);
      saveFile(`pocketlab-class-${code}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e) {
      setError(message(e));
    }
  }
  async function remove() {
    if (!window.confirm('Удалить занятие и все результаты с сервера? Это нельзя отменить.')) return;
    try {
      await classApi.deleteRoom(code, ref!.ownerToken);
      forgetTeacherRoom(code);
      go('class');
    } catch (e) {
      setError(message(e));
    }
  }
  const state = snap?.state;
  return (
    <>
      <button className="back" onClick={() => go('class')}>
        <ArrowLeft size={16} />
        Класс
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЗАНЯТИЕ · ПАНЕЛЬ УЧИТЕЛЯ</div>
          <h1>{snap?.title || 'Открой закон маятника'}</h1>
          <p>{state ? stateNames[state] : 'Подключаемся…'}</p>
        </div>
        <Connection status={status} />
      </div>
      {(error || ended) && (
        <p className="error" role="alert">
          {error || ended}
        </p>
      )}
      <div className="class-grid">
        <section className="white-card join-card">
          <QrCode text={joinUrl(code)} label={`QR-код для входа в комнату ${code}`} />
          <div>
            <span className="eyebrow">КОД КОМНАТЫ</span>
            <div className="code-big">{code}</div>
            <p className="subtle">{joinUrl(code)}</p>
            <div className="result-actions">
              <button
                className="secondary"
                onClick={() => void navigator.clipboard?.writeText(joinUrl(code))}
              >
                <Copy size={15} />
                Ссылка для входа
              </button>
              <a
                className="secondary button-link"
                href={screenUrl(code, ref.viewerToken)}
                target="_blank"
                rel="noreferrer"
              >
                <MonitorUp size={15} />
                Общий экран
              </a>
            </div>
          </div>
        </section>
        <section className="white-card">
          <span className="eyebrow">ХОД ЗАНЯТИЯ</span>
          <div className="result-actions state-buttons">
            <button
              className={state === 'collecting' ? 'primary' : 'secondary'}
              disabled={!snap || state === 'closed'}
              onClick={() => run({ type: 'setState', state: 'collecting' })}
            >
              Начать сбор
            </button>
            <button
              className={state === 'discussing' ? 'primary' : 'secondary'}
              disabled={!snap || state === 'closed'}
              onClick={() => run({ type: 'setState', state: 'discussing' })}
            >
              Обсуждение
            </button>
            <button
              className="secondary"
              disabled={!snap || state === 'closed'}
              onClick={() =>
                window.confirm('Завершить занятие? Новые результаты приниматься не будут.') &&
                run({ type: 'setState', state: 'closed' })
              }
            >
              Завершить
            </button>
            <button
              className="secondary"
              disabled={!snap}
              onClick={() => run({ type: 'lockJoin', locked: !snap?.joinLocked })}
            >
              {snap?.joinLocked ? <Unlock size={15} /> : <Lock size={15} />}
              {snap?.joinLocked ? 'Открыть вход' : 'Закрыть вход'}
            </button>
          </div>
          {snap && (
            <p className="subtle">
              Приём результатов до {new Date(snap.activeUntil).toLocaleTimeString('ru-RU')}. Данные
              удалятся {new Date(snap.deleteAt).toLocaleDateString('ru-RU')}.
            </p>
          )}
          <div className="result-actions">
            <button className="secondary" onClick={exportRoom}>
              <Download size={15} />
              Экспорт JSON
            </button>
            <button className="text-button" onClick={remove}>
              <Trash2 size={15} />
              Удалить занятие
            </button>
          </div>
        </section>
      </div>
      <section className="white-card">
        <div className="section-heading">
          <h2>Участники ({snap?.participantCount ?? 0})</h2>
          <button
            className="secondary"
            disabled={!snap?.participants?.some((p) => !p.condition)}
            onClick={distribute}
          >
            Распределить длины 0,2–1 м
          </button>
        </div>
        {snap?.participants?.length ? (
          <div className="table-scroll">
            <table className="trial-table">
              <thead>
                <tr>
                  <th>Псевдоним</th>
                  <th>Длина нити, м</th>
                  <th>Попыток</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snap.participants.map((p) => (
                  <tr key={p.id}>
                    <td>{p.pseudonym}</td>
                    <td>
                      <input
                        className="text-input narrow"
                        aria-label={`Длина для ${p.pseudonym}`}
                        inputMode="decimal"
                        value={
                          lengths[p.id] ??
                          (p.condition ? String(p.condition.lengthM).replace('.', ',') : '')
                        }
                        onChange={(e) => setLengths({ ...lengths, [p.id]: e.target.value })}
                        onBlur={() => {
                          const text = lengths[p.id];
                          if (text === undefined) return;
                          const value = parseDecimal(text);
                          void run({
                            type: 'assign',
                            participantId: p.id,
                            condition: text.trim() ? { lengthM: value } : null,
                          });
                          const { [p.id]: _, ...rest } = lengths;
                          setLengths(rest);
                        }}
                        placeholder="любая"
                      />
                    </td>
                    <td>{p.submissions}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          window.confirm(
                            `Убрать «${p.pseudonym}» из комнаты? Его точки скроются.`,
                          ) && run({ type: 'removeParticipant', participantId: p.id })
                        }
                      >
                        Убрать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="subtle">Пока никто не вошёл. Покажи QR-код или код комнаты.</p>
        )}
      </section>
      <section className="white-card">
        <h2>Присланные результаты ({snap?.submissions.length ?? 0})</h2>
        <p className="subtle">
          Значения прислали устройства учеников; сервер проверил формат и диапазоны, но не
          подтверждает, как было проведено измерение.
        </p>
        {snap && snap.submissions.length > 0 && (
          <div className="table-scroll">
            <table className="trial-table">
              <thead>
                <tr>
                  <th>Кто</th>
                  <th>L, м</th>
                  <th>T, с</th>
                  <th>Время</th>
                  <th>На экране</th>
                </tr>
              </thead>
              <tbody>
                {snap.submissions.map((s) => (
                  <tr key={s.id} className={s.hidden ? 'excluded' : ''}>
                    <td>{s.pseudonym}</td>
                    <td>{fmt(s.input.lengthM, 3)}</td>
                    <td>{fmt(analyzePendulum(s.input).period, 3)}</td>
                    <td>{new Date(s.receivedAt).toLocaleTimeString('ru-RU')}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          run({ type: 'setHidden', submissionId: s.id, hidden: !s.hidden })
                        }
                      >
                        {s.hidden ? 'Показать' : 'Скрыть'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {snap && <ClassBoard submissions={snap.submissions} />}
    </>
  );
}
function StudentRoom({ code }: { code: string }) {
  const ref = studentRoom()?.code === code ? studentRoom()! : null;
  const { snap, status, ended } = useRoom(code, ref?.token);
  const [items, setItems] = useState<Outgoing[]>(() => outbox(code));
  const [length, setLength] = useState('');
  const [cycles, setCycles] = useState('10');
  const [elapsed, setElapsed] = useState('');
  const [lengthError, setLengthError] = useState('0,005');
  const [timeError, setTimeError] = useState('0,3');
  const [saved, setSaved] = useState<PendulumTrial[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void listInvestigations()
      .then(({ records }) =>
        setSaved(
          records.flatMap((r) =>
            r.scenarioId === 'pendulum-01' && r.provenance === 'manual' ? r.trials : [],
          ),
        ),
      )
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (snap?.me?.condition && !length)
      setLength(String(snap.me.condition.lengthM).replace('.', ','));
  }, [snap?.me?.condition, length]);
  const update = (next: Outgoing[]) => {
    setItems(next);
    saveOutbox(code, next);
  };
  // Queued submissions are retried with the same idempotency key until the server answers.
  useEffect(() => {
    if (!ref) return;
    let busy = false;
    const flush = async () => {
      if (busy) return;
      busy = true;
      for (const item of outbox(code).filter((i) => i.status === 'queued')) {
        try {
          await classApi.submit(code, ref.token, item.body);
          update(
            outbox(code).map((i) =>
              i.body.idempotencyKey === item.body.idempotencyKey ? { ...i, status: 'sent' } : i,
            ),
          );
        } catch (e) {
          if (e instanceof ClassApiError)
            update(
              outbox(code).map((i) =>
                i.body.idempotencyKey === item.body.idempotencyKey
                  ? { ...i, status: 'rejected', error: e.message }
                  : i,
              ),
            );
        }
      }
      busy = false;
    };
    void flush();
    const timer = setInterval(flush, 5000);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flush);
    };
  }, [code, ref?.token, status]);
  const parsed = pendulumInputSchema.safeParse({
    lengthM: parseDecimal(length),
    cycles: parseDecimal(cycles),
    elapsedS: parseDecimal(elapsed),
    lengthErrorM: parseDecimal(lengthError),
    timingErrorS: parseDecimal(timeError),
  });
  const preview = parsed.success ? analyzePendulum(parsed.data) : null;
  const condition = snap?.me?.condition;
  const off =
    parsed.success && condition
      ? Math.abs(parsed.data.lengthM - condition.lengthM) > Math.max(0.01, condition.lengthM * 0.1)
      : false;
  if (!ref)
    return (
      <div className="white-card">
        <h1>Ты не в этой комнате</h1>
        <button className="primary" onClick={() => go(`class/join/${code}`)}>
          Войти в {code}
        </button>
      </div>
    );
  function send() {
    if (!parsed.success) return;
    setError('');
    const body: SubmissionInput = {
      idempotencyKey: crypto.randomUUID(),
      scenarioId: 'pendulum-01',
      input: parsed.data,
      provenance: 'manual',
      acquisitionKind: 'entered',
    };
    update([...items, { body, status: 'queued' }]);
    setElapsed('');
    void classApi
      .submit(code, ref!.token, body)
      .then(() =>
        update(
          outbox(code).map((i) =>
            i.body.idempotencyKey === body.idempotencyKey ? { ...i, status: 'sent' } : i,
          ),
        ),
      )
      .catch((e) => {
        if (e instanceof ClassApiError)
          update(
            outbox(code).map((i) =>
              i.body.idempotencyKey === body.idempotencyKey
                ? { ...i, status: 'rejected', error: e.message }
                : i,
            ),
          );
        else setError('Нет связи: результат в очереди и уйдёт автоматически.');
      });
  }
  return (
    <>
      <button className="back" onClick={() => go('class')}>
        <ArrowLeft size={16} />
        Класс
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            КОМНАТА {code} · {ref.pseudonym}
          </div>
          <h1>{snap?.title || 'Открой закон маятника'}</h1>
          <p>{snap ? stateNames[snap.state] : 'Подключаемся…'}</p>
        </div>
        <Connection status={status} />
      </div>
      {(ended || error) && (
        <p className="error" role="alert">
          {ended || error}
        </p>
      )}
      <section className="white-card timing-card">
        <div className="step-label">
          <span>1</span>Твоё задание
        </div>
        <h2>
          {condition
            ? `Измерь период при длине нити ${fmt(condition.lengthM, 3)} м`
            : 'Измерь период маятника при выбранной длине'}
        </h2>
        <p>
          Засеки 10 полных колебаний, повтори 2–3 раза. Можно взять попытку из своего дневника
          маятника.
        </p>
        {saved.length > 0 && (
          <label className="inline-field">
            Из дневника
            <select
              aria-label="Попытка из дневника"
              value=""
              onChange={(e) => {
                const t = saved.find((s) => s.id === e.target.value);
                if (!t) return;
                const c = (n: number) => String(n).replace('.', ',');
                setLength(c(t.input.lengthM));
                setCycles(String(t.input.cycles));
                setElapsed(c(t.input.elapsedS));
                setLengthError(c(t.input.lengthErrorM));
                setTimeError(c(t.input.timingErrorS));
              }}
            >
              <option value="">выбрать попытку…</option>
              {saved.map((t) => (
                <option key={t.id} value={t.id}>
                  L {fmt(t.input.lengthM, 3)} м · {t.input.cycles} кол. · {fmt(t.input.elapsedS, 2)}{' '}
                  с
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="measurement-fields" disabled={snap?.state !== 'collecting'}>
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
              onChange={(e) => setElapsed(e.target.value)}
            />
          </label>
        </fieldset>
        <details className="uncertainty-settings">
          <summary>Погрешности</summary>
          <fieldset className="measurement-fields">
            <label>
              Граница ошибки длины, м
              <input
                inputMode="decimal"
                value={lengthError}
                onChange={(e) => setLengthError(e.target.value)}
              />
            </label>
            <label>
              Граница ошибки времени, с
              <input
                inputMode="decimal"
                value={timeError}
                onChange={(e) => setTimeError(e.target.value)}
              />
            </label>
          </fieldset>
        </details>
        {preview && (
          <div className="trial-preview">
            <div>
              <span>Будет отправлено</span>
              <strong>
                L = {fmt(parsed.data!.lengthM, 3)} м, T = {fmt(preview.period, 3)} ±{' '}
                {fmt(preview.periodError, 3)} с
              </strong>
            </div>
            <p>Учитель и класс увидят эти числа и твой псевдоним.</p>
            {off && <p className="measurement-warning">Длина отличается от задания учителя.</p>}
          </div>
        )}
        <div className="result-actions">
          <button
            className="primary"
            disabled={!parsed.success || off || snap?.state !== 'collecting'}
            onClick={send}
          >
            <Send size={16} />
            Отправить учителю
          </button>
          {snap && snap.state !== 'collecting' && (
            <span className="subtle">
              {snap.state === 'lobby' ? 'Учитель ещё не начал сбор.' : 'Сбор результатов завершён.'}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <ul className="class-list">
            {items.map((i) => (
              <li key={i.body.idempotencyKey} className={i.status}>
                L {fmt(i.body.input.lengthM, 3)} м · {fmt(analyzePendulum(i.body.input).period, 3)}{' '}
                с —{' '}
                {i.status === 'sent'
                  ? 'отправлено'
                  : i.status === 'queued'
                    ? 'в очереди'
                    : `отклонено: ${i.error}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      {snap && <ClassBoard submissions={snap.submissions} />}
      <div className="result-actions">
        <button
          className="text-button"
          onClick={() => {
            if (!window.confirm('Выйти из комнаты на этом устройстве?')) return;
            saveStudentRoom(null);
            go('class');
          }}
        >
          Выйти из комнаты
        </button>
      </div>
    </>
  );
}
function ClassScreen({ code, token }: { code: string; token: string }) {
  const { snap, status, ended } = useRoom(code, token);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    if (snap) setUpdated(new Date());
  }, [snap]);
  const points = useMemo(() => snap?.submissions.length ?? 0, [snap]);
  return (
    <div className="class-screen">
      <header className="screen-header">
        <div>
          <span className="eyebrow">ОБЩИЙ ЭКРАН · {snap ? stateNames[snap.state] : '…'}</span>
          <h1>{snap?.title || 'Открой закон маятника'}</h1>
          <p>
            Участников {snap?.participantCount ?? 0} · точек {points}
            {updated && ` · обновлено ${updated.toLocaleTimeString('ru-RU')}`}
          </p>
          <Connection status={status} />
        </div>
        {snap?.state !== 'closed' && (
          <div className="screen-join">
            <QrCode text={joinUrl(code)} label={`QR-код для входа в комнату ${code}`} />
            <div className="code-big">{code}</div>
          </div>
        )}
      </header>
      {ended && (
        <p className="error" role="alert">
          {ended}
        </p>
      )}
      {snap && <ClassBoard submissions={snap.submissions} />}
    </div>
  );
}
