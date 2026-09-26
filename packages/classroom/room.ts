import {
  CLASS_LIMITS,
  commandSchema,
  createRoomSchema,
  joinSchema,
  submissionInputSchema,
  type BoardSubmission,
  type Command,
  type Role,
  type RoomSnapshot,
  type RoomState,
  type SubmissionInput,
} from '../contracts/classroom';
/**
 * One classroom room as plain data plus pure operations. The server authenticates a bearer token
 * by its SHA-256 hash (raw tokens are never stored) and passes the principal in. Every accepted
 * change increments `revision`; clients converge by replacing their view with the latest snapshot.
 */
export type Principal =
  { role: 'owner' } | { role: 'viewer' } | { role: 'participant'; id: string };
type Participant = {
  id: string;
  tokenHash: string;
  pseudonym: string;
  joinedAt: number;
  condition: { lengthM: number } | null;
  removed: boolean;
};
type Submission = Omit<BoardSubmission, 'pseudonym' | 'receivedAt'> & {
  key: string;
  receivedAt: number;
  fingerprint: string;
};
export type RoomData = {
  version: 1;
  code: string;
  scenarioId: 'pendulum-01';
  title: string;
  createdAt: number;
  state: RoomState;
  joinLocked: boolean;
  revision: number;
  ownerHash: string;
  viewerHash: string;
  participants: Participant[];
  submissions: Submission[];
  audit: { revision: number; at: number; actor: Role; type: string }[];
  /** Sliding windows for rate limits (timestamps, ms). */
  recentJoins: number[];
  recentSubmits: Record<string, number[]>;
};
export class RoomError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const iso = (ms: number) => new Date(ms).toISOString();
function bump(room: RoomData, now: number, actor: Role, type: string) {
  room.revision++;
  room.audit.push({ revision: room.revision, at: now, actor, type });
  if (room.audit.length > 1000) room.audit.splice(0, room.audit.length - 1000);
}
function window(times: number[], now: number, limit: number) {
  const recent = times.filter((t) => now - t < 60_000);
  if (recent.length >= limit)
    throw new RoomError(429, 'RATE_LIMITED', 'Слишком много запросов. Подожди минуту.');
  recent.push(now);
  return recent;
}
/** Closed once the teacher closes it or the active period ends. */
export function effectiveState(room: RoomData, now: number): RoomState {
  return now >= room.createdAt + CLASS_LIMITS.activeMs ? 'closed' : room.state;
}
export function createRoom(
  body: unknown,
  o: { code: string; ownerHash: string; viewerHash: string; now: number },
): RoomData {
  const params = createRoomSchema.parse(body);
  return {
    version: 1,
    code: o.code,
    scenarioId: params.scenarioId,
    title: params.title,
    createdAt: o.now,
    state: 'lobby',
    joinLocked: false,
    revision: 1,
    ownerHash: o.ownerHash,
    viewerHash: o.viewerHash,
    participants: [],
    submissions: [],
    audit: [{ revision: 1, at: o.now, actor: 'owner', type: 'create' }],
    recentJoins: [],
    recentSubmits: {},
  };
}
export function authenticate(room: RoomData, tokenHash: string | null): Principal | null {
  if (!tokenHash) return null;
  if (tokenHash === room.ownerHash) return { role: 'owner' };
  if (tokenHash === room.viewerHash) return { role: 'viewer' };
  const p = room.participants.find((q) => q.tokenHash === tokenHash && !q.removed);
  return p ? { role: 'participant', id: p.id } : null;
}
export function join(
  room: RoomData,
  body: unknown,
  o: { id: string; tokenHash: string; now: number },
): Participant {
  const { pseudonym } = joinSchema.parse(body);
  room.recentJoins = window(room.recentJoins, o.now, CLASS_LIMITS.joinsPerMinute);
  if (effectiveState(room, o.now) === 'closed')
    throw new RoomError(409, 'ROOM_CLOSED', 'Занятие завершено.');
  if (room.joinLocked) throw new RoomError(403, 'JOIN_LOCKED', 'Учитель закрыл вход в комнату.');
  const active = room.participants.filter((p) => !p.removed);
  if (active.length >= CLASS_LIMITS.participants)
    throw new RoomError(409, 'ROOM_FULL', 'В комнате уже 30 участников.');
  if (active.some((p) => p.pseudonym.toLocaleLowerCase() === pseudonym.toLocaleLowerCase()))
    throw new RoomError(409, 'NAME_TAKEN', 'Этот псевдоним уже занят. Выбери другой.');
  const participant: Participant = {
    id: o.id,
    tokenHash: o.tokenHash,
    pseudonym,
    joinedAt: o.now,
    condition: null,
    removed: false,
  };
  room.participants.push(participant);
  bump(room, o.now, 'participant', 'join');
  return participant;
}
const fingerprintOf = (s: SubmissionInput) =>
  JSON.stringify([s.scenarioId, s.input, s.provenance, s.acquisitionKind]);
/** Idempotent: the same key with the same payload returns the stored submission. */
export function submit(
  room: RoomData,
  who: Principal,
  body: unknown,
  o: { id: string; now: number },
): { submission: Submission; duplicate: boolean } {
  if (who.role !== 'participant')
    throw new RoomError(403, 'FORBIDDEN', 'Отправлять результаты могут только участники.');
  const data = submissionInputSchema.parse(body);
  const fingerprint = fingerprintOf(data);
  const existing = room.submissions.find(
    (s) => s.participantId === who.id && s.key === data.idempotencyKey,
  );
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new RoomError(
        409,
        'KEY_REUSED',
        'Этот ключ отправки уже использован с другими данными.',
      );
    return { submission: existing, duplicate: true };
  }
  const state = effectiveState(room, o.now);
  if (state === 'lobby')
    throw new RoomError(409, 'NOT_COLLECTING', 'Учитель ещё не начал сбор результатов.');
  if (state !== 'collecting')
    throw new RoomError(409, 'NOT_COLLECTING', 'Сбор результатов завершён.');
  const me = room.participants.find((p) => p.id === who.id)!;
  if (me.condition) {
    const { lengthM } = me.condition;
    if (Math.abs(data.input.lengthM - lengthM) > Math.max(0.01, lengthM * 0.1))
      throw new RoomError(
        422,
        'CONDITION_MISMATCH',
        `Твоё условие: длина ${lengthM.toLocaleString('ru-RU')} м. Измерь при этой длине.`,
      );
  }
  const mine = room.submissions.filter((s) => s.participantId === who.id);
  if (mine.length >= CLASS_LIMITS.submissionsPerParticipant)
    throw new RoomError(409, 'TOO_MANY', 'Достигнут предел: 20 попыток на участника.');
  if (room.submissions.length >= CLASS_LIMITS.submissionsTotal)
    throw new RoomError(409, 'TOO_MANY', 'В комнате достигнут предел попыток.');
  room.recentSubmits[who.id] = window(
    room.recentSubmits[who.id] ?? [],
    o.now,
    CLASS_LIMITS.submitsPerMinute,
  );
  const submission: Submission = {
    id: o.id,
    participantId: who.id,
    key: data.idempotencyKey,
    fingerprint,
    receivedAt: o.now,
    input: data.input,
    acquisitionKind: data.acquisitionKind,
    hidden: false,
  };
  room.submissions.push(submission);
  bump(room, o.now, 'participant', 'submit');
  return { submission, duplicate: false };
}
export function command(room: RoomData, who: Principal, body: unknown, now: number) {
  if (who.role !== 'owner')
    throw new RoomError(403, 'FORBIDDEN', 'Управлять комнатой может только учитель.');
  const cmd: Command = commandSchema.parse(body);
  switch (cmd.type) {
    case 'setState':
      if (effectiveState(room, now) === 'closed' && cmd.state !== 'closed')
        throw new RoomError(409, 'ROOM_CLOSED', 'Закрытое занятие нельзя открыть снова.');
      room.state = cmd.state;
      break;
    case 'lockJoin':
      room.joinLocked = cmd.locked;
      break;
    case 'assign': {
      const p = room.participants.find((q) => q.id === cmd.participantId && !q.removed);
      if (!p) throw new RoomError(404, 'NOT_FOUND', 'Участник не найден.');
      p.condition = cmd.condition;
      break;
    }
    case 'setHidden': {
      const s = room.submissions.find((q) => q.id === cmd.submissionId);
      if (!s) throw new RoomError(404, 'NOT_FOUND', 'Попытка не найдена.');
      s.hidden = cmd.hidden;
      break;
    }
    case 'removeParticipant': {
      const p = room.participants.find((q) => q.id === cmd.participantId);
      if (!p) throw new RoomError(404, 'NOT_FOUND', 'Участник не найден.');
      p.removed = true;
      for (const s of room.submissions) if (s.participantId === p.id) s.hidden = true;
      break;
    }
  }
  bump(room, now, 'owner', cmd.type);
}
/** Role-filtered view. Tokens, hashes, idempotency keys and rate data never leave the server. */
export function snapshot(room: RoomData, who: Principal, now: number): RoomSnapshot {
  const names = new Map(room.participants.map((p) => [p.id, p.pseudonym]));
  const active = room.participants.filter((p) => !p.removed);
  const visible = room.submissions.filter((s) => who.role === 'owner' || !s.hidden);
  const me = who.role === 'participant' ? active.find((p) => p.id === who.id) : undefined;
  return {
    code: room.code,
    scenarioId: room.scenarioId,
    title: room.title,
    state: effectiveState(room, now),
    joinLocked: room.joinLocked,
    revision: room.revision,
    createdAt: iso(room.createdAt),
    activeUntil: iso(room.createdAt + CLASS_LIMITS.activeMs),
    deleteAt: iso(room.createdAt + CLASS_LIMITS.retentionMs),
    role: who.role,
    participantCount: active.length,
    participants:
      who.role === 'owner'
        ? active.map((p) => ({
            id: p.id,
            pseudonym: p.pseudonym,
            joinedAt: iso(p.joinedAt),
            condition: p.condition,
            submissions: room.submissions.filter((s) => s.participantId === p.id).length,
          }))
        : null,
    me: me ? { id: me.id, pseudonym: me.pseudonym, condition: me.condition } : null,
    submissions: visible.map((s) => ({
      id: s.id,
      participantId: s.participantId,
      pseudonym: names.get(s.participantId) ?? '—',
      receivedAt: iso(s.receivedAt),
      input: s.input,
      acquisitionKind: s.acquisitionKind,
      hidden: s.hidden,
    })),
  };
}
/** Teacher export: the full room without secrets. */
export function exportRoom(room: RoomData, now: number) {
  return {
    ...snapshot(room, { role: 'owner' }, now),
    exportedAt: iso(now),
    audit: room.audit.map((a) => ({ ...a, at: iso(a.at) })),
  };
}
