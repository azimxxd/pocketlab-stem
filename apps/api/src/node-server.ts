/**
 * Local development/test host for the classroom API: the same router and RoomServer as the
 * Cloudflare Worker, with rooms kept in memory. Run: node apps/api/src/node-server.ts
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { Readable } from 'node:stream';
import type { RoomData } from '../../../packages/classroom/room';
import { route } from './router';
import { RoomServer, type RoomStorage } from './room-server';
class MemoryStorage implements RoomStorage {
  data: RoomData | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private wake: () => void) {}
  async load() {
    return this.data ? structuredClone(this.data) : null;
  }
  async save(room: RoomData) {
    this.data = structuredClone(room);
  }
  async destroy() {
    this.data = null;
    if (this.timer) clearTimeout(this.timer);
  }
  async schedule(at: number) {
    if (this.timer) clearTimeout(this.timer);
    // Timers beyond ~24 days overflow; retention is re-scheduled on each wake-up.
    this.timer = setTimeout(this.wake, Math.min(Math.max(0, at - Date.now()), 2 ** 31 - 1));
    this.timer.unref();
  }
}
function toRequest(req: IncomingMessage, base: string) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers))
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  return new Request(new URL(req.url ?? '/', base), {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    signal: controller.signal,
    // @ts-expect-error Node requires duplex for streamed request bodies.
    duplex: 'half',
  });
}
export function startServer(o: { port: number; allowedOrigins: string[] }): Promise<Server> {
  const rooms = new Map<string, RoomServer>();
  const room = (code: string) => {
    let server = rooms.get(code);
    if (!server) {
      const storage: MemoryStorage = new MemoryStorage(() => void server!.alarm());
      server = new RoomServer(storage);
      rooms.set(code, server);
    }
    return server;
  };
  const http = createServer(async (req, res) => {
    const response = await route(toRequest(req, `http://127.0.0.1:${o.port}`), {
      room,
      allowedOrigins: o.allowedOrigins,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) return res.end();
    const reader = response.body.getReader();
    res.on('close', () => void reader.cancel().catch(() => {}));
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) break;
      res.write(value);
    }
    res.end();
  });
  return new Promise((resolve) => http.listen(o.port, '127.0.0.1', () => resolve(http)));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const origins = (
    process.env.ALLOWED_ORIGINS ??
    'http://127.0.0.1:5173,http://localhost:5173,http://localhost:4173'
  )
    .split(',')
    .map((s) => s.trim());
  await startServer({ port, allowedOrigins: origins });
  console.log(`classroom API on http://127.0.0.1:${port} (origins: ${origins.join(', ')})`);
}
