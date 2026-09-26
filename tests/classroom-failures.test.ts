import { expect, it } from 'vitest';
import { route } from '../apps/api/src/router';
import { RoomServer, type RoomStorage } from '../apps/api/src/room-server';
import type { RoomData } from '../packages/classroom/room';
import { createClassApi } from '../apps/web/src/classroom/client';

function fixture() {
  let fail: 'save' | 'destroy' | 'schedule' | null = null;
  const rooms = new Map<string, RoomServer>();
  const api = createClassApi('https://class.test', async (input, init) =>
    route(new Request(input, init), {
      allowedOrigins: [],
      room(code) {
        if (!rooms.has(code)) {
          let data: RoomData | null = null;
          const storage: RoomStorage = {
            async load() {
              return structuredClone(data);
            },
            async save(room) {
              if (fail === 'save') throw new Error('disk');
              data = structuredClone(room);
            },
            async destroy() {
              if (fail === 'destroy') throw new Error('disk');
              data = null;
            },
            async schedule() {
              if (fail === 'schedule') throw new Error('alarm');
            },
          };
          rooms.set(code, new RoomServer(storage));
        }
        return rooms.get(code)!;
      },
    }),
  );
  return {
    api,
    fail: (mode: typeof fail) => {
      fail = mode;
    },
  };
}

it.each(['save', 'schedule'] as const)(
  'failed %s never publishes uncommitted room changes; retry works',
  async (mode) => {
    const f = fixture();
    const room = await f.api.createRoom('Test');
    f.fail(mode);
    await expect(f.api.join(room.code, 'Асель')).rejects.toMatchObject({ status: 500 });
    const after = await f.api.snapshot(room.code, room.ownerToken);
    expect(after.participantCount).toBe(0);
    expect(after.revision).toBe(room.snapshot.revision);
    f.fail(null);
    await f.api.join(room.code, 'Асель');
    expect((await f.api.snapshot(room.code, room.ownerToken)).participantCount).toBe(1);
  },
);

it('failed deletion preserves the room and retry can delete it', async () => {
  const f = fixture();
  const room = await f.api.createRoom('Test');
  f.fail('destroy');
  await expect(f.api.deleteRoom(room.code, room.ownerToken)).rejects.toMatchObject({ status: 500 });
  expect((await f.api.snapshot(room.code, room.ownerToken)).revision).toBe(1);
  f.fail(null);
  await f.api.deleteRoom(room.code, room.ownerToken);
  await expect(f.api.snapshot(room.code, room.ownerToken)).rejects.toMatchObject({ status: 404 });
});

it('oversized chunked bodies without Content-Length are rejected before reaching a room', async () => {
  let cancelled = false;
  let calls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(9000));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://class.test/rooms', {
    method: 'POST',
    body,
    // @ts-expect-error Required for Node streamed requests.
    duplex: 'half',
  });
  const response = await route(request, {
    allowedOrigins: [],
    room() {
      calls++;
      throw new Error('must not dispatch');
    },
  });
  expect(response.status).toBe(413);
  expect(cancelled).toBe(true);
  expect(calls).toBe(0);
});
