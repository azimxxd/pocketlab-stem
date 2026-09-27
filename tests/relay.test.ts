import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachRelay } from "../server/relay";
test("relay session isolation, validation, one phone, reconnect and interruptions", async () => {
  const server = createServer(),
    { wss } = attachRelay(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(ws);
    await once(ws, "open");
    return ws;
  }
  const next = (ws: WebSocket) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Message timeout")),
        2000,
      );
      ws.once("message", (raw) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()));
      });
    });
  const send = (ws: WebSocket, m: unknown) => ws.send(JSON.stringify(m));
  try {
    const laptop = await client();
    let pending = next(laptop);
    send(laptop, { type: "create", token: "laptop-token-123456" });
    const session = await pending;
    assert.equal(session.code.length, 6);
    const other = await client();
    pending = next(other);
    send(other, { type: "create", token: "other-laptop-token" });
    const otherSession = await pending;
    assert.notEqual(session.code, otherSession.code);
    const phone = await client();
    pending = next(phone);
    let peer = next(laptop);
    send(phone, {
      type: "join",
      code: session.code,
      token: "phone-token-123456",
      userAgent: "test",
    });
    assert.equal((await pending).type, "joined");
    assert.equal((await peer).connected, true);
    let leaked = false;
    other.on("message", () => (leaked = true));
    pending = next(laptop);
    send(phone, { type: "status", message: "Sensors granted" });
    assert.equal((await pending).message, "Sensors granted");
    assert.equal(leaked, false);
    const rawSample = {
      sequence: 0,
      timestamp: 123456,
      source: "motion",
      acceleration: { x: null, y: 1, z: 2 },
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
      rotationRate: { alpha: null, beta: 3, gamma: 4 },
      orientation: { alpha: null, beta: null, gamma: null },
      orientationTimestamp: null,
      screenAngle: 0,
    };
    pending = next(laptop);
    send(phone, { type: "sample", sample: rawSample });
    assert.deepEqual((await pending).sample, rawSample);
    assert.equal(leaked, false);
    pending = next(phone);
    send(phone, { type: "sample", sample: { sequence: 0 } });
    assert.equal((await pending).type, "error");
    const second = await client();
    pending = next(second);
    send(second, {
      type: "join",
      code: session.code,
      token: "second-phone-token",
      userAgent: "test",
    });
    assert.match((await pending).message, /already/);
    pending = next(phone);
    send(laptop, {
      type: "state",
      state: "CALIBRATING",
      message: "Hold still",
    });
    assert.equal((await pending).state, "CALIBRATING");
    pending = next(laptop);
    send(phone, { type: "interruption", reason: "hidden" });
    assert.equal((await pending).reason, "hidden");
    pending = next(laptop);
    phone.close();
    assert.equal((await pending).connected, false);
    const resumed = await client();
    pending = next(resumed);
    send(resumed, {
      type: "resume",
      code: session.code,
      token: "incorrect-secret-token",
    });
    assert.equal((await pending).type, "error");
    pending = next(resumed);
    send(resumed, {
      type: "resume",
      code: session.code,
      token: "laptop-token-123456",
    });
    assert.equal((await pending).type, "session");

    const switchPhone=await client();pending=next(switchPhone);send(switchPhone,{type:"join",code:session.code,token:"phone-token-123456",userAgent:"test"});
    assert.equal((await pending).experiment,"pendulum");assert.equal((await next(resumed)).connected,true);
  } finally {
    for (const s of sockets) s.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
