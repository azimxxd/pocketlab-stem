import { CODE_ALPHABET, roomCodeSchema } from '../../../packages/contracts/classroom';
import { newToken, problem, sha256 } from './room-server';
export type RoomHandle = { fetch(request: Request): Promise<Response> };
export type RouterDeps = {
  /** The single object that owns room `code` (a Durable Object in production). */
  room(code: string): RoomHandle;
  allowedOrigins: string[];
  /** Optional per-client limiter for creating and joining rooms. */
  limit?(key: string): Promise<boolean>;
};
const MAX_BODY = 16 * 1024;
export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
function cors(request: Request, response: Response, allowed: string[]) {
  const origin = request.headers.get('origin');
  const headers = new Headers(response.headers);
  if (origin && allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-headers', 'authorization, content-type');
    headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    headers.set('access-control-max-age', '600');
  }
  headers.append('vary', 'Origin');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
/**
 * Public API. Routes: POST /rooms; POST /rooms/:code/join; GET …/snapshot; GET …/events (SSE);
 * POST …/submissions; POST …/commands; GET …/export; DELETE /rooms/:code.
 * Authorization is a bearer capability token, checked by the room itself on every request.
 */
export async function route(request: Request, deps: RouterDeps): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && !deps.allowedOrigins.includes(origin))
    return cors(request, problem(403, 'ORIGIN', 'Запросы разрешены только с сайта PocketLab.'), []);
  if (request.method === 'OPTIONS')
    return cors(request, new Response(null, { status: 204 }), deps.allowedOrigins);
  const response = await dispatch(request, deps).catch(() =>
    problem(500, 'INTERNAL', 'Сервер класса не смог обработать запрос.'),
  );
  return cors(request, response, deps.allowedOrigins);
}
async function dispatch(request: Request, deps: RouterDeps): Promise<Response> {
  const url = new URL(request.url);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return problem(413, 'TOO_LARGE', 'Слишком большой запрос.');
  // Content-Length is optional and untrusted: also bound the actual streamed body.
  if (request.method === 'POST' && request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY) {
          void reader.cancel().catch(() => {});
          return problem(413, 'TOO_LARGE', 'Слишком большой запрос.');
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    request = new Request(request, { body });
  }
  const client = request.headers.get('cf-connecting-ip') ?? 'local';
  const parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'GET' && url.pathname === '/health') return new Response('ok');
  if (parts[0] !== 'rooms') return problem(404, 'NOT_FOUND', 'Нет такого адреса.');
  if (parts.length === 1 && request.method === 'POST') {
    if (deps.limit && !(await deps.limit(`create:${client}`)))
      return problem(429, 'RATE_LIMITED', 'Слишком много новых комнат. Подожди минуту.');
    const params = await request.json().catch(() => null);
    const ownerToken = newToken(),
      viewerToken = newToken();
    const [ownerHash, viewerHash] = await Promise.all([sha256(ownerToken), sha256(viewerToken)]);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const res = await deps.room(code).fetch(
        new Request(`https://room/rooms/${code}/create`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ params, code, ownerHash, viewerHash }),
        }),
      );
      if (res.status === 409) continue;
      if (!res.ok) return res;
      return new Response(
        JSON.stringify({ code, ownerToken, viewerToken, snapshot: await res.json() }),
        { status: 201, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }
    return problem(503, 'BUSY', 'Не удалось подобрать код комнаты. Попробуй ещё раз.');
  }
  const code = roomCodeSchema.safeParse((parts[1] ?? '').toUpperCase());
  if (!code.success) return problem(404, 'NO_ROOM', 'Комната не найдена.');
  const action = parts[2] ?? '';
  const allowed =
    (request.method === 'POST' && ['join', 'submissions', 'commands'].includes(action)) ||
    (request.method === 'GET' && ['snapshot', 'events', 'export'].includes(action)) ||
    (request.method === 'DELETE' && action === '');
  if (!allowed || parts.length > 3) return problem(404, 'NOT_FOUND', 'Нет такого действия.');
  if (action === 'join' && deps.limit && !(await deps.limit(`join:${client}`)))
    return problem(429, 'RATE_LIMITED', 'Слишком много попыток входа. Подожди минуту.');
  const forwarded = new Request(`https://room/rooms/${code.data}/${action}`, request);
  return deps.room(code.data).fetch(forwarded);
}
