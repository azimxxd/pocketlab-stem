/// <reference lib="webworker" />
import { startTracker, step, toGray, type TrackerState } from '../../../../packages/vision/tracker';
export type TrackerRequest =
  | {
      type: 'start';
      pixels: ArrayBuffer;
      width: number;
      height: number;
      x: number;
      y: number;
      r: number;
    }
  | { type: 'step'; pixels: ArrayBuffer; width: number; height: number; dtRatio: number };
let state: TrackerState | null = null;
self.onmessage = (e: MessageEvent<TrackerRequest>) => {
  const msg = e.data;
  const gray = toGray(new Uint8ClampedArray(msg.pixels), msg.width, msg.height);
  if (msg.type === 'start') {
    state = startTracker(gray, msg.x, msg.y, msg.r);
    self.postMessage({ status: state ? 'ok' : 'lost', point: null });
    return;
  }
  if (!state) {
    self.postMessage({ status: 'lost', point: null });
    return;
  }
  const result = step(state, gray, msg.dtRatio);
  state = result.state;
  self.postMessage({ status: result.status, point: result.point });
};
