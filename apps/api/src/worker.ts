import { DurableObject } from 'cloudflare:workers';
import type { RoomData } from '../../../packages/classroom/room';
import { route } from './router';
import { RoomServer, type RoomStorage } from './room-server';
interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** Comma-separated site origins allowed by CORS. */
  ALLOWED_ORIGINS: string;
  LIMITER?: RateLimit;
  JOIN_LIMITER?: RateLimit;
}
class DurableStorage implements RoomStorage {
  constructor(private storage: DurableObjectStorage) {}
  async load() {
    return (await this.storage.get<RoomData>('room')) ?? null;
  }
  save(room: RoomData) {
    return this.storage.put('room', room);
  }
  async destroy() {
    await this.storage.deleteAlarm();
    await this.storage.deleteAll();
  }
  schedule(at: number) {
    return this.storage.setAlarm(at);
  }
}
/** One Durable Object per room code: single-threaded state, SQLite-backed storage, alarms. */
export class Room extends DurableObject<Env> {
  private server = new RoomServer(new DurableStorage(this.ctx.storage));
  fetch(request: Request) {
    return this.server.fetch(request);
  }
  alarm() {
    return this.server.alarm();
  }
}
export default {
  fetch(request, env) {
    return route(request, {
      room: (code) => env.ROOMS.get(env.ROOMS.idFromName(code)),
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
      limit: async (key) => {
        const limiter = key.startsWith('join:') ? env.JOIN_LIMITER : env.LIMITER;
        return limiter ? (await limiter.limit({ key })).success : true;
      },
    });
  },
} satisfies ExportedHandler<Env>;
