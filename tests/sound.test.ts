import test from "node:test";
import assert from "node:assert/strict";
import { estimatePitch } from "../src/sound/analysis";
import { clientMessage } from "../src/contracts";
import { soundFrameSchema } from "../src/sound/contracts";

test("YIN finds the fundamental even when its harmonic is louder, at actual sample rates", () => {
  for (const rate of [32000, 44100, 48000, 96000]) {
    for (const frequency of [110, 220, 440, 880]) {
      const samples = Float32Array.from({ length: 4096 }, (_, i) =>
        0.15 * Math.sin(2 * Math.PI * frequency * i / rate) + 0.4 * Math.sin(4 * Math.PI * frequency * i / rate));
      assert.ok(Math.abs(estimatePitch(samples, rate)! - frequency) < 2, `${rate}: ${frequency}`);
    }
  }
});

test("silence, low level signals, noise and impulses do not invent pitch", () => {
  assert.equal(estimatePitch(new Float32Array(4096), 48000), null);
  let seed = 123;
  const noise = Float32Array.from({ length: 4096 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  });
  assert.equal(estimatePitch(noise, 48000), null);
  const impulse = new Float32Array(4096); impulse[1000] = 1;
  assert.equal(estimatePitch(impulse, 48000), null);
});

test("legacy creation defaults to pendulum and sound frames have finite bounded payloads", () => {
  const parsed = clientMessage.parse({ type: "create", token: "a".repeat(24) });
  assert.ok(parsed.type === "create" && parsed.experiment === "pendulum");
  assert.equal(soundFrameSchema.safeParse({ sequence: 0, timestamp: 1, sampleRate: 48000,
    maxFrequency: 8000, waveform: Array(256).fill(0), spectrum: Array(128).fill(-120), pitch: null, level: -120 }).success, true);
  assert.equal(soundFrameSchema.safeParse({ waveform: Array(100000).fill(0) }).success, false);
});
