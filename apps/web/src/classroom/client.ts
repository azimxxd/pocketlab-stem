import {
  createdRoomSchema,
  joinedSchema,
  snapshotSchema,
  type Command,
  type RoomSnapshot,
  type SubmissionInput,
} from '../../../../packages/contracts/classroom';
export class ClassApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';
export type StreamEnd = 'deleted' | 'revoked' | 'not-found' | 'unauthorized';
/** Parses `text/event-stream` chunks into {event, data} records. */
export function sseParser(onEvent: (event: string, data: string) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue;
        const i = line.indexOf(':');
        const field = i < 0 ? line : line.slice(0, i);
        const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length) onEvent(event, data.join('\n'));
    }
  };
}
/**
 * Client for the classroom API. Tokens travel only in the Authorization header, never in URLs.
 * The event stream is read with fetch (EventSource cannot send headers) and reconnects with
 * backoff; each event carries a full snapshot, so a reconnect needs no replay.
 */
export function createClassApi(base: string, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  async function call<T>(
    path: string,
    o: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      method: o.method ?? 'GET',
      headers: {
        ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new ClassApiError(
        response.status,
        payload?.error?.code ?? 'HTTP',
        payload?.error?.message ?? `Ошибка сервера (${response.status})`,
      );
    return payload as T;
  }
  return {
    createRoom: async (title: string) =>
      createdRoomSchema.parse(
        await call('/rooms', { method: 'POST', body: { scenarioId: 'pendulum-01', title } }),
      ),
    join: async (code: string, pseudonym: string) =>
      joinedSchema.parse(
        await call(`/rooms/${code}/join`, { method: 'POST', body: { pseudonym } }),
      ),
    snapshot: async (code: string, token: string) =>
      snapshotSchema.parse(await call(`/rooms/${code}/snapshot`, { token })),
    submit: (code: string, token: string, body: SubmissionInput) =>
      call<{ submissionId: string; duplicate: boolean }>(`/rooms/${code}/submissions`, {
        method: 'POST',
        token,
        body,
      }),
    command: async (code: string, token: string, cmd: Command) =>
      snapshotSchema.parse(
        await call(`/rooms/${code}/commands`, { method: 'POST', token, body: cmd }),
      ),
    exportRoom: (code: string, token: string) => call<unknown>(`/rooms/${code}/export`, { token }),
    deleteRoom: (code: string, token: string) =>
      call<void>(`/rooms/${code}`, { method: 'DELETE', token }),
    subscribe(
      code: string,
      token: string,
      on: {
        snapshot: (s: RoomSnapshot) => void;
        status?: (s: StreamStatus) => void;
        end?: (reason: StreamEnd) => void;
      },
    ) {
      const abort = new AbortController();
      let attempt = 0;
      let ended = false;
      const finish = (reason: StreamEnd) => {
        ended = true;
        on.status?.('ended');
        on.end?.(reason);
        abort.abort();
      };
      const run = async () => {
        while (!ended && !abort.signal.aborted) {
          on.status?.(attempt ? 'reconnecting' : 'connecting');
          try {
            const response = await fetchImpl(`${base}/rooms/${code}/events`, {
              headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
              signal: abort.signal,
            });
            if (response.status === 401 || response.status === 403) return finish('unauthorized');
            if (response.status === 404) return finish('not-found');
            if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
            const decoder = new TextDecoder();
            const reader = response.body.getReader();
            const feed = sseParser((event, data) => {
              if (event === 'snapshot') {
                attempt = 0;
                on.status?.('live');
                on.snapshot(snapshotSchema.parse(JSON.parse(data)));
              } else if (event === 'deleted') finish('deleted');
              else if (event === 'revoked') finish('revoked');
            });
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              feed(decoder.decode(value, { stream: true }));
            }
          } catch {
            if (abort.signal.aborted) return;
          }
          if (ended || abort.signal.aborted) return;
          attempt++;
          const delay =
            Math.min(10_000, 500 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() / 2);
          await new Promise((r) => setTimeout(r, delay));
        }
      };
      void run();
      return () => {
        ended = true;
        abort.abort();
      };
    },
  };
}
export type ClassApi = ReturnType<typeof createClassApi>;
