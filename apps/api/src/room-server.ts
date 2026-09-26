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
  type Principal,
  type RoomData,
} from '../../../packages/classroom/room';
import { CLASS_LIMITS } from '../../../packages/contracts/classroom';
import { ZodError } from 'zod';
export interface RoomStorage {
  load(): Promise<RoomData | null>;
  save(room: RoomData): Promise<void>;
  destroy(): Promise<void>;
  /** Wake the room at `at` (ms) to close it or delete it on schedule. */
  schedule(at: number): Promise<void>;
}
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
export const problem = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);
export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** 256-bit capability token, base64url. */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
type Stream = {
  principal: Principal;
  send: (chunk: string) => void;
  close: () => void;
  lastRevision: number;
};
const encoder = new TextEncoder();
/**
 * HTTP surface of one room. Requests are serialised, so the room data is never modified
 * concurrently. Every change is saved and then pushed to every open event stream as that
 * viewer's role-filtered snapshot (SSE, `id` = revision).
 */
export class RoomServer {
  private room: RoomData | null | undefined;
  private streams = new Set<Stream>();
  private queue: Promise<unknown> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  constructor(
    private storage: RoomStorage,
    private clock: () => number = Date.now,
  ) {}
  private async load() {
    if (this.room === undefined) this.room = await this.storage.load();
    return this.room;
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }
  private async persist(room: RoomData) {
    const now = this.clock();
    const activeUntil = room.createdAt + CLASS_LIMITS.activeMs;
    await this.storage.schedule(
      now < activeUntil ? activeUntil : room.createdAt + CLASS_LIMITS.retentionMs,
    );
    await this.storage.save(room);
    this.broadcast();
  }
  private broadcast() {
    const room = this.room;
    if (!room) return;
    const now = this.clock();
    for (const s of this.streams) {
      const who = s.principal;
      // A removed participant's open stream is revoked, not just filtered.
      const still =
        who.role !== 'participant' || room.participants.some((p) => p.id === who.id && !p.removed);
      if (!still) {
        s.send('event: revoked\ndata: {}\n\n');
        s.close();
        continue;
      }
      const view = snapshot(room, s.principal, now);
      s.lastRevision = view.revision;
      s.send(`id: ${view.revision}\nevent: snapshot\ndata: ${JSON.stringify(view)}\n\n`);
    }
  }
  private async principal(request: Request, room: RoomData) {
    const auth = request.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    return token ? authenticate(room, await sha256(token)) : null;
  }
  /** Scheduled wake-up: broadcast the automatic close, or delete everything after retention. */
  async alarm() {
    return this.serial(async () => {
      const room = await this.load();
      if (!room) return;
      const now = this.clock();
      if (now >= room.createdAt + CLASS_LIMITS.retentionMs) {
        await this.destroy('expired');
        return;
      }
      this.broadcast();
      await this.storage.schedule(room.createdAt + CLASS_LIMITS.retentionMs);
    });
  }
  private async destroy(reason: string) {
    await this.storage.destroy();
    for (const s of this.streams) {
      s.send(`event: deleted\ndata: ${JSON.stringify({ reason })}\n\n`);
      s.close();
    }
    this.streams.clear();
    this.room = null;
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      return await this.serial(async () => {
        try {
          if (request.method === 'GET' && path.endsWith('/events'))
            return await this.events(request);
          return await this.handle(request, path);
        } catch (error) {
          // Operations mutate the cached room. After a failed write, disk is authoritative.
          this.room = undefined;
          throw error;
        }
      });
    } catch (e) {
      if (e instanceof RoomError) return problem(e.status, e.code, e.message);
      if (e instanceof ZodError)
        return problem(422, 'INVALID', e.issues[0]?.message ?? 'Неверные данные');
      if (e instanceof SyntaxError) return problem(400, 'BAD_JSON', 'Тело запроса — не JSON');
      throw e;
    }
  }
  private async handle(request: Request, path: string): Promise<Response> {
    const now = this.clock();
    const body = request.method === 'POST' ? await request.json() : undefined;
    if (request.method === 'POST' && path.endsWith('/create')) {
      if (await this.load()) return problem(409, 'EXISTS', 'Код уже занят');
      const { params, code, ownerHash, viewerHash } = body as {
        params: unknown;
        code: string;
        ownerHash: string;
        viewerHash: string;
      };
      const room = createRoom(params, { code, ownerHash, viewerHash, now });
      this.room = room;
      await this.persist(room);
      return json(snapshot(room, { role: 'owner' }, now), 201);
    }
    const room = await this.load();
    if (!room) return problem(404, 'NO_ROOM', 'Комната не найдена или уже удалена.');
    if (request.method === 'POST' && path.endsWith('/join')) {
      const token = newToken();
      const p = join(room, body, { id: crypto.randomUUID(), tokenHash: await sha256(token), now });
      await this.persist(room);
      return json(
        {
          participantToken: token,
          snapshot: snapshot(room, { role: 'participant', id: p.id }, now),
        },
        201,
      );
    }
    const who = await this.principal(request, room);
    if (!who) return problem(401, 'UNAUTHORIZED', 'Нет доступа к этой комнате.');
    if (request.method === 'GET' && path.endsWith('/snapshot'))
      return json(snapshot(room, who, now));
    if (request.method === 'POST' && path.endsWith('/submissions')) {
      const { submission, duplicate } = submit(room, who, body, { id: crypto.randomUUID(), now });
      if (!duplicate) await this.persist(room);
      return json({ submissionId: submission.id, duplicate }, duplicate ? 200 : 201);
    }
    if (request.method === 'POST' && path.endsWith('/commands')) {
      command(room, who, body, now);
      await this.persist(room);
      return json(snapshot(room, who, now));
    }
    if (who.role !== 'owner') return problem(403, 'FORBIDDEN', 'Только для учителя.');
    if (request.method === 'GET' && path.endsWith('/export')) return json(exportRoom(room, now));
    if (request.method === 'DELETE') {
      await this.destroy('deleted-by-owner');
      return new Response(null, { status: 204 });
    }
    return problem(404, 'NOT_FOUND', 'Нет такого действия.');
  }
  /** SSE: the current snapshot at once, then one per change; heartbeat comments keep it open. */
  private async events(request: Request): Promise<Response> {
    const room = await this.load();
    if (!room) return problem(404, 'NO_ROOM', 'Комната не найдена или уже удалена.');
    const who = await this.principal(request, room);
    if (!who) return problem(401, 'UNAUTHORIZED', 'Нет доступа к этой комнате.');
    let stream: Stream;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let open = true;
        stream = {
          principal: who,
          lastRevision: 0,
          send: (chunk) => {
            if (open) controller.enqueue(encoder.encode(chunk));
          },
          close: () => {
            if (!open) return;
            open = false;
            this.streams.delete(stream);
            if (!this.streams.size && this.heartbeat) {
              clearInterval(this.heartbeat);
              this.heartbeat = null;
            }
            try {
              controller.close();
            } catch {}
          },
        };
        this.streams.add(stream);
        const view = snapshot(room, who, this.clock());
        stream.lastRevision = view.revision;
        stream.send(
          `retry: 2000\nid: ${view.revision}\nevent: snapshot\ndata: ${JSON.stringify(view)}\n\n`,
        );
        this.heartbeat ??= setInterval(() => {
          for (const s of this.streams) s.send(': ping\n\n');
          if (!this.streams.size && this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
          }
        }, 20_000);
        request.signal.addEventListener('abort', () => stream.close());
      },
      cancel: () => stream.close(),
    });
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    });
  }
  /** For tests: effective state without a request. */
  async stateNow() {
    const room = await this.load();
    return room ? effectiveState(room, this.clock()) : null;
  }
}
