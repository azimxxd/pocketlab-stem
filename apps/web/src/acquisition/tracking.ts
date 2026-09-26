import type { AutoRun } from '../../../../packages/contracts';
import { TRACKER, type Match, type StepStatus } from '../../../../packages/vision/tracker';
import { seekFrame, type VideoInfo } from './video';
/** Frames are analysed at most this size (longest side), then mapped back to video pixels. */
const MAX_SIDE = 480;
/**
 * Runs the tracker in a Worker over consecutive frames from `startFrame`. Every frame is shown
 * with the same verified seek as manual marking. The run stops — it never interpolates — when
 * the object is lost, leaves the frame, stays ambiguous, the clip ends or `signal` aborts.
 */
export async function trackVideo(o: {
  video: HTMLVideoElement;
  info: VideoInfo;
  startFrame: number;
  start: { x: number; y: number };
  radiusPx: number;
  signal: AbortSignal;
  onProgress: (frame: number) => void;
}): Promise<{ run: AutoRun; verified: number; mismatch: number }> {
  const { video, info } = o;
  const downscale = Math.min(1, MAX_SIDE / Math.max(info.width, info.height));
  const width = Math.round(info.width * downscale),
    height = Math.round(info.height * downscale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const worker = new Worker(new URL('../workers/tracker.worker.ts', import.meta.url), {
    type: 'module',
  });
  const ask = (msg: object, pixels: ArrayBuffer) =>
    new Promise<{ status: StepStatus; point: Match | null }>((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(e.message || 'Ошибка трекера'));
      worker.postMessage({ ...msg, pixels, width, height }, [pixels]);
    });
  const counts = { verified: 0, mismatch: 0 };
  const grab = async (frame: number) => {
    const r = await seekFrame(video, info, frame);
    if (r !== 'unverified') counts[r]++;
    ctx.drawImage(video, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data.buffer;
  };
  const run: AutoRun = {
    id: crypto.randomUUID(),
    algorithmVersion: TRACKER.algorithmVersion,
    startFrame: o.startFrame,
    radiusPx: o.radiusPx,
    downscale,
    points: [],
    stop: { frame: null, reason: 'END', score: null },
  };
  try {
    const r = Math.max(3, Math.round(o.radiusPx * downscale));
    const started = await ask(
      { type: 'start', x: o.start.x * downscale, y: o.start.y * downscale, r },
      await grab(o.startFrame),
    );
    if (started.status !== 'ok') {
      run.stop = { frame: o.startFrame, reason: 'LOST', score: null };
      return { run, ...counts };
    }
    let ambiguousRun = 0;
    const times = info.frameTimes;
    for (let f = o.startFrame + 1; f < times.length; f++) {
      if (o.signal.aborted) {
        run.stop = { frame: f, reason: 'CANCELLED', score: null };
        break;
      }
      o.onProgress(f);
      const previous =
        f - 2 >= o.startFrame ? times[f - 1] - times[f - 2] : times[f] - times[f - 1];
      const dtRatio = (times[f] - times[f - 1]) / previous;
      const result = await ask({ type: 'step', dtRatio }, await grab(f));
      if (result.status === 'lost' || result.status === 'out') {
        run.stop = {
          frame: f,
          reason: result.status === 'lost' ? 'LOST' : 'OUT_OF_FRAME',
          score: result.point?.score ?? null,
        };
        break;
      }
      const p = result.point!;
      ambiguousRun = result.status === 'ambiguous' ? ambiguousRun + 1 : 0;
      run.points.push({
        frame: f,
        t: times[f],
        x: p.x / downscale,
        y: p.y / downscale,
        score: Math.max(-1, Math.min(1, p.score)),
        ambiguous: result.status === 'ambiguous',
      });
      if (ambiguousRun >= 3) {
        run.stop = { frame: f, reason: 'AMBIGUOUS', score: p.score };
        break;
      }
      if (run.points.length >= 3000) break;
    }
    return { run, ...counts };
  } finally {
    worker.terminate();
  }
}
