import { describe, it, expect } from 'vitest';
import {
  authenticate,
  command,
  createRoom,
  effectiveState,
  exportRoom,
  join,
  RoomError,
  snapshot,
  submit,
  type RoomData,
} from '../packages/classroom/room';
import { CLASS_LIMITS, snapshotSchema } from '../packages/contracts/classroom';
const T0 = Date.parse('2026-09-26T09:00:00Z');
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
function room(): RoomData {
  return createRoom(
    { scenarioId: 'pendulum-01', title: '9Б' },
    { code: 'ABC234', ownerHash: 'h-owner', viewerHash: 'h-viewer', now: T0 },
  );
}
const trial = (lengthM = 0.5, key = uuid()) => ({
  idempotencyKey: key,
  scenarioId: 'pendulum-01',
  provenance: 'manual',
  acquisitionKind: 'timer',
  input: { lengthM, cycles: 10, elapsedS: 14.2, lengthErrorM: 0.005, timingErrorS: 0.3 },
});
const owner = { role: 'owner' } as const;
function student(r: RoomData, name = 'Айгерим') {
  const p = join(r, { pseudonym: name }, { id: uuid(), tokenHash: `h-${name}`, now: T0 });
  return { role: 'participant' as const, id: p.id };
}
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof RoomError ? e.code : 'VALIDATION';
  }
  return 'OK';
};
describe('classroom room core', () => {
  it('authenticates by token hash; the room code is not a credential', () => {
    const r = room();
    const s = student(r);
    expect(authenticate(r, 'h-owner')).toEqual(owner);
    expect(authenticate(r, 'h-viewer')).toEqual({ role: 'viewer' });
    expect(authenticate(r, 'h-Айгерим')).toEqual(s);
    expect(authenticate(r, 'ABC234')).toBeNull();
    expect(authenticate(r, null)).toBeNull();
  });
  it('follows lobby → collecting → discussing → closed and cannot reopen', () => {
    const r = room();
    const s = student(r);
    expect(code(() => submit(r, s, trial(), { id: uuid(), now: T0 }))).toBe('NOT_COLLECTING');
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    expect(code(() => submit(r, s, trial(), { id: uuid(), now: T0 }))).toBe('OK');
    command(r, owner, { type: 'setState', state: 'discussing' }, T0);
    expect(code(() => submit(r, s, trial(), { id: uuid(), now: T0 }))).toBe('NOT_COLLECTING');
    command(r, owner, { type: 'setState', state: 'closed' }, T0);
    expect(code(() => command(r, owner, { type: 'setState', state: 'collecting' }, T0))).toBe(
      'ROOM_CLOSED',
    );
    expect(
      code(() => join(r, { pseudonym: 'Ерлан' }, { id: uuid(), tokenHash: 'x', now: T0 })),
    ).toBe('ROOM_CLOSED');
  });
  it('closes itself after the active period', () => {
    const r = room();
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    expect(effectiveState(r, T0 + CLASS_LIMITS.activeMs - 1)).toBe('collecting');
    expect(effectiveState(r, T0 + CLASS_LIMITS.activeMs)).toBe('closed');
    expect(snapshot(r, owner, T0 + CLASS_LIMITS.activeMs).state).toBe('closed');
  });
  it('only the owner controls the room', () => {
    const r = room();
    const s = student(r);
    for (const who of [s, { role: 'viewer' } as const])
      expect(code(() => command(r, who, { type: 'lockJoin', locked: true }, T0))).toBe('FORBIDDEN');
    expect(code(() => submit(r, owner, trial(), { id: uuid(), now: T0 }))).toBe('FORBIDDEN');
    expect(code(() => submit(r, { role: 'viewer' }, trial(), { id: uuid(), now: T0 }))).toBe(
      'FORBIDDEN',
    );
  });
  it('enforces lock, capacity and unique pseudonyms', () => {
    const r = room();
    student(r, 'Дана');
    expect(
      code(() => join(r, { pseudonym: 'дана' }, { id: uuid(), tokenHash: 'y', now: T0 })),
    ).toBe('NAME_TAKEN');
    command(r, owner, { type: 'lockJoin', locked: true }, T0);
    expect(
      code(() => join(r, { pseudonym: 'Тимур' }, { id: uuid(), tokenHash: 'z', now: T0 })),
    ).toBe('JOIN_LOCKED');
    command(r, owner, { type: 'lockJoin', locked: false }, T0);
    for (let i = 1; i < CLASS_LIMITS.participants; i++) student(r, `Ученик ${i}`);
    expect(
      code(() => join(r, { pseudonym: 'Лишний' }, { id: uuid(), tokenHash: 'w', now: T0 })),
    ).toBe('ROOM_FULL');
  });
  it('rejects malformed pseudonyms and measurements through the shared schemas', () => {
    const r = room();
    expect(
      code(() => join(r, { pseudonym: '<script>' }, { id: uuid(), tokenHash: 'a', now: T0 })),
    ).toBe('VALIDATION');
    const s = student(r);
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    const bad = trial();
    bad.input.lengthM = 50;
    expect(code(() => submit(r, s, bad, { id: uuid(), now: T0 }))).toBe('VALIDATION');
    expect(
      code(() => submit(r, s, { ...trial(), provenance: 'simulation' }, { id: uuid(), now: T0 })),
    ).toBe('VALIDATION');
  });
  it('retries with the same key do not duplicate; a reused key with other data is refused', () => {
    const r = room();
    const s = student(r);
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    const body = trial();
    const first = submit(r, s, body, { id: uuid(), now: T0 });
    const revision = r.revision;
    const again = submit(r, s, body, { id: uuid(), now: T0 + 5000 });
    expect(again.duplicate).toBe(true);
    expect(again.submission.id).toBe(first.submission.id);
    expect(r.revision).toBe(revision);
    expect(r.submissions).toHaveLength(1);
    const changed = { ...body, input: { ...body.input, elapsedS: 15 } };
    expect(code(() => submit(r, s, changed, { id: uuid(), now: T0 }))).toBe('KEY_REUSED');
  });
  it('checks the assigned condition and the per-minute rate', () => {
    const r = room();
    const s = student(r);
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    command(r, owner, { type: 'assign', participantId: s.id, condition: { lengthM: 0.75 } }, T0);
    expect(code(() => submit(r, s, trial(0.5), { id: uuid(), now: T0 }))).toBe(
      'CONDITION_MISMATCH',
    );
    for (let i = 0; i < CLASS_LIMITS.submitsPerMinute; i++)
      submit(r, s, trial(0.75), { id: uuid(), now: T0 + i });
    expect(code(() => submit(r, s, trial(0.75), { id: uuid(), now: T0 + 100 }))).not.toBe('OK');
  });
  it('hidden and removed data are filtered for everyone but the owner', () => {
    const r = room();
    const a = student(r, 'Асель');
    const b = student(r, 'Бауыржан');
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    const sa = submit(r, a, trial(), { id: uuid(), now: T0 }).submission;
    submit(r, b, trial(), { id: uuid(), now: T0 });
    command(r, owner, { type: 'setHidden', submissionId: sa.id, hidden: true }, T0);
    expect(snapshot(r, { role: 'viewer' }, T0).submissions).toHaveLength(1);
    expect(snapshot(r, owner, T0).submissions.filter((s) => s.hidden)).toHaveLength(1);
    command(r, owner, { type: 'removeParticipant', participantId: b.id }, T0);
    expect(authenticate(r, 'h-Бауыржан')).toBeNull();
    expect(snapshot(r, a, T0).submissions).toHaveLength(0);
    expect(snapshot(r, a, T0).participantCount).toBe(1);
  });
  it('snapshots never contain secrets and match the published schema', () => {
    const r = room();
    const s = student(r);
    command(r, owner, { type: 'setState', state: 'collecting' }, T0);
    submit(r, s, trial(), { id: uuid(), now: T0 });
    for (const who of [owner, s, { role: 'viewer' } as const]) {
      const view = snapshot(r, who, T0);
      expect(snapshotSchema.safeParse(view).success).toBe(true);
      const text = JSON.stringify(view);
      for (const secret of ['h-owner', 'h-viewer', 'h-Айгерим', 'idempotency', 'fingerprint'])
        expect(text).not.toContain(secret);
    }
    expect(snapshot(r, s, T0).participants).toBeNull();
    expect(snapshot(r, owner, T0).participants).toHaveLength(1);
    const exported = JSON.stringify(exportRoom(r, T0));
    expect(exported).not.toContain('h-owner');
    expect(exported).toContain('"type":"submit"');
  });
});
