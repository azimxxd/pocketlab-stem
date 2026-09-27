import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachRelay } from "../server/relay";

test("sound uses the shared session, enforces payload roles and survives both peer reconnects", async () => {
  const server = createServer(), { wss } = attachRelay(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const sockets: WebSocket[] = [];
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/ws`);
    sockets.push(ws); await once(ws, "open"); return ws;
  }
  const next = (ws: WebSocket) => new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 2000);
    ws.once("message", raw => { clearTimeout(timeout); resolve(JSON.parse(raw.toString())); });
  });
  const send = (ws: WebSocket, message: unknown) => ws.send(JSON.stringify(message));
  try {
    let laptop = await client(), phone = await client();
    let reply = next(laptop);
    send(laptop, { type: "create", token: "laptop-token-123456", experiment: "sound" });
    const session = await reply; assert.equal(session.experiment, "sound");
    reply = next(phone); let peer = next(laptop);
    const join = { type: "join", code: session.code, token: "phone-token-123456", userAgent: "test" };
    send(phone, join); assert.equal((await reply).experiment, "sound"); await peer;
    reply = next(laptop); send(phone, { type: "sound-ready", ready: true }); assert.equal((await reply).ready, true);
    const frame = { type: "sound-frame", frame: { sequence: 0, timestamp: 1, sampleRate: 48000,
      maxFrequency: 8000, waveform: Array(256).fill(0), spectrum: Array(128).fill(-120), pitch: null, level: -120 } };
    reply = next(laptop); send(phone, frame); assert.deepEqual(await reply, frame);
    reply = next(laptop); send(laptop, frame); assert.equal((await reply).type, "error");
    reply = next(phone); send(phone, { ...frame, frame: { ...frame.frame, spectrum: [null] } }); assert.equal((await reply).type, "error");
    reply = next(phone); send(laptop, { type: "state", state: "MEASURING", message: "Measure" }); assert.equal((await reply).state, "MEASURING");
    reply = next(laptop); phone.close(); assert.equal((await reply).connected, false);
    phone = await client(); reply = next(phone); peer = next(laptop); send(phone, join);
    assert.equal((await reply).experiment, "sound"); assert.equal((await peer).connected, true);
    reply = next(phone); laptop.close(); assert.equal((await reply).connected, false);
    laptop = await client(); reply = next(laptop); peer = next(phone);
    send(laptop, { type: "resume", code: session.code, token: "laptop-token-123456" });
    const resumed = await reply; assert.equal(resumed.experiment, "sound"); assert.equal(resumed.phoneConnected, true); await peer;
    reply = next(laptop); send(phone, frame); assert.deepEqual(await reply, frame);
    const motion = await client(); reply = next(motion);
    send(motion, { type: "create", token: "motion-token-123456" }); const motionSession = await reply;
    const motionPhone = await client(); reply = next(motionPhone); peer = next(motion);
    send(motionPhone, { ...join, code: motionSession.code }); await reply; await peer;
    reply = next(motionPhone); send(motionPhone, frame); assert.equal((await reply).type, "error");
  } finally {
    sockets.forEach(s => s.terminate());
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
