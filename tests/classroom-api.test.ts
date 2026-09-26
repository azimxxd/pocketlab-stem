import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { startServer } from '../apps/api/src/node-server';
import { ClassApiError, createClassApi, type StreamEnd } from '../apps/web/src/classroom/client';
import type { RoomSnapshot } from '../packages/contracts/classroom';
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let server: Server;
const api = createClassApi(BASE);
beforeAll(async () => {
  server = await startServer({ port: PORT, allowedOrigins: ['https://pocketlab-stem.vercel.app'] });
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
const trial = (lengthM = 0.5) => ({
  idempotencyKey: crypto.randomUUID(),
  scenarioId: 'pendulum-01' as const,
  provenance: 'manual' as const,
  acquisitionKind: 'entered' as const,
  input: { lengthM, cycles: 10, elapsedS: 14.2, lengthErrorM: 0.005, timingErrorS: 0.3 },
});
function watch(code: string, token: string, fetchImpl?: typeof fetch) {
  const client = fetchImpl ? createClassApi(BASE, fetchImpl) : api;
  const seen: RoomSnapshot[] = [];
  const ends: StreamEnd[] = [];
  const waiters: { test: (s: RoomSnapshot) => boolean; resolve: (s: RoomSnapshot) => void }[] = [];
  const stop = client.subscribe(code, token, {
    snapshot: (s) => {
      seen.push(s);
      for (const w of [...waiters])
        if (w.test(s)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(s);
        }
    },
    end: (r) => ends.push(r),
  });
  const until = (test: (s: RoomSnapshot) => boolean, ms = 5000) =>
    new Promise<RoomSnapshot>((resolve, reject) => {
      const hit = seen.find(test);
      if (hit) return resolve(hit);
      waiters.push({ test, resolve });
      setTimeout(() => reject(new Error('timeout waiting for snapshot')), ms);
    });
  return { seen, ends, until, stop };
}
const failsWith = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ClassApiError ? `${e.status} ${e.code}` : String(e);
  }
  return 'OK';
};
describe('classroom API', () => {
  it('30 students submit at once; the shared screen sees every point, p95 ≤ 2 s', async () => {
    const room = await api.createRoom('9Б');
    await api.command(room.code, room.ownerToken, { type: 'setState', state: 'collecting' });
    const screen = watch(room.code, room.viewerToken);
    await screen.until((s) => s.state === 'collecting');
    const students = await Promise.all(
      Array.from({ length: 30 }, (_, i) => api.join(room.code, `Ученик ${i + 1}`)),
    );
    const latencies = await Promise.all(
      students.map(async (s, i) => {
        const start = performance.now();
        const { submissionId } = await api.submit(
          room.code,
          s.participantToken,
          trial(0.2 + (i % 5) * 0.2),
        );
        await screen.until((snap) => snap.submissions.some((q) => q.id === submissionId));
        return performance.now() - start;
      }),
    );
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95) - 1];
    expect(p95).toBeLessThan(2000);
    const last = await screen.until((s) => s.submissions.length === 30);
    expect(last.participantCount).toBe(30);
    await expect(failsWith(api.join(room.code, 'Тридцать первый'))).resolves.toBe('409 ROOM_FULL');
    screen.stop();
  }, 20000);
  it('a dropped stream reconnects and catches up from the latest snapshot', async () => {
    const room = await api.createRoom('');
    let drops = 0;
    // The first event stream is cut right after its initial snapshot, as a flaky network would.
    const flaky: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (!String(input).endsWith('/events') || drops++ > 0 || !response.body) return response;
      const reader = response.body.getReader();
      const first = await reader.read();
      void reader.cancel();
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(first.value!);
            c.close();
          },
        }),
        { headers: response.headers },
      );
    };
    const teacher = watch(room.code, room.ownerToken, flaky);
    await teacher.until((s) => s.revision === 1);
    await api.join(room.code, 'Асель');
    const after = await teacher.until((s) => s.participantCount === 1, 8000);
    expect(after.participants?.[0].pseudonym).toBe('Асель');
    expect(drops).toBeGreaterThanOrEqual(2);
    teacher.stop();
  }, 15000);
  it('retries never duplicate a submission', async () => {
    const room = await api.createRoom('');
    await api.command(room.code, room.ownerToken, { type: 'setState', state: 'collecting' });
    const s = await api.join(room.code, 'Дана');
    const body = trial();
    const [a, b] = await Promise.all([
      api.submit(room.code, s.participantToken, body),
      api.submit(room.code, s.participantToken, body),
    ]);
    expect(a.submissionId).toBe(b.submissionId);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const view = await api.snapshot(room.code, room.ownerToken);
    expect(view.submissions).toHaveLength(1);
  });
  it('roles and rooms are isolated', async () => {
    const a = await api.createRoom('A');
    const b = await api.createRoom('B');
    const student = await api.join(a.code, 'Тимур');
    const cmd = { type: 'lockJoin', locked: true } as const;
    await expect(failsWith(api.command(b.code, a.ownerToken, cmd))).resolves.toBe(
      '401 UNAUTHORIZED',
    );
    await expect(failsWith(api.snapshot(b.code, student.participantToken))).resolves.toBe(
      '401 UNAUTHORIZED',
    );
    await expect(failsWith(api.command(a.code, student.participantToken, cmd))).resolves.toBe(
      '403 FORBIDDEN',
    );
    await expect(failsWith(api.command(a.code, a.viewerToken, cmd))).resolves.toBe('403 FORBIDDEN');
    await expect(failsWith(api.exportRoom(a.code, a.viewerToken))).resolves.toBe('403 FORBIDDEN');
    await expect(failsWith(api.snapshot(a.code, a.code))).resolves.toBe('401 UNAUTHORIZED');
    await expect(failsWith(api.join('ZZZZZZ', 'Кто-то'))).resolves.toBe('404 NO_ROOM');
    const view = await api.snapshot(a.code, student.participantToken);
    expect(view.participants).toBeNull();
    expect(JSON.stringify(view)).not.toContain(a.ownerToken);
  });
  it('rejects foreign browser origins and unauthenticated streams', async () => {
    const res = await fetch(`${BASE}/rooms`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const ok = await fetch(`${BASE}/rooms`, {
      method: 'OPTIONS',
      headers: { origin: 'https://pocketlab-stem.vercel.app' },
    });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://pocketlab-stem.vercel.app');
    const room = await api.createRoom('');
    expect((await fetch(`${BASE}/rooms/${room.code}/events`)).status).toBe(401);
  });
  it('removing a student revokes their stream; deleting the room ends everyone', async () => {
    const room = await api.createRoom('');
    const s = await api.join(room.code, 'Ерлан');
    const student = watch(room.code, s.participantToken);
    const screen = watch(room.code, room.viewerToken);
    await student.until((x) => x.me?.pseudonym === 'Ерлан');
    await api.command(room.code, room.ownerToken, {
      type: 'removeParticipant',
      participantId: s.snapshot.me!.id,
    });
    await expect.poll(() => student.ends).toEqual(['revoked']);
    await api.deleteRoom(room.code, room.ownerToken);
    await expect.poll(() => screen.ends).toEqual(['deleted']);
    await expect(failsWith(api.join(room.code, 'Поздно'))).resolves.toBe('404 NO_ROOM');
  });
});
