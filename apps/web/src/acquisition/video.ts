import { readMp4Timing } from '../../../../packages/media/mp4-timing';
import { median } from '../../../../packages/physics/sound';
export const VIDEO_LIMITS = { bytes: 100 * 1024 * 1024, seconds: 30 };
export type VideoInfo = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
  durationS: number;
  codec: string | null;
  /** Presentation times of frames. With an unknown timebase these are nominal steps for browsing only. */
  frameTimes: number[];
  endS: number;
  timebase: 'container' | 'unknown';
  timebaseIssues: string[];
  medianFrameIntervalS: number | null;
  /** (p90 − p10) / median of frame intervals; > 0.1 means variable frame rate. */
  frameIntervalSpread: number | null;
};
const NOMINAL_STEP = 1 / 30;
function metadata(url: string) {
  return new Promise<{ width: number; height: number; durationS: number }>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () =>
      resolve({ width: video.videoWidth, height: video.videoHeight, durationS: video.duration });
    video.onerror = () =>
      reject(
        new Error('Браузер не смог открыть этот ролик. Сними видео камерой телефона в MP4/MOV.'),
      );
    video.src = url;
  });
}
/**
 * Reads frame timing from the MP4/MOV container locally (only box headers and the moov box are
 * read). The file is never uploaded. Other containers get an explicit «unknown» timebase.
 */
export async function inspectVideo(file: File): Promise<VideoInfo> {
  if (file.size > VIDEO_LIMITS.bytes)
    throw new Error('Файл больше 100 МБ. Сними короткий ролик (до 30 секунд) или обрежь его.');
  const url = URL.createObjectURL(file);
  try {
    const meta = await metadata(url);
    if (!Number.isFinite(meta.durationS) || meta.durationS > VIDEO_LIMITS.seconds + 0.5)
      throw new Error('Ролик длиннее 30 секунд. Обрежь его в галерее и выбери снова.');
    if (!meta.width || !meta.height) throw new Error('В файле нет видеодорожки.');
    const timing = await readMp4Timing(
      file.size,
      async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer()),
    ).catch(() => null);
    const usable = timing && timing.frameTimes.length > 1 && !timing.issues.includes('MALFORMED');
    const frameTimes = usable
      ? timing.frameTimes
      : Array.from(
          { length: Math.floor(meta.durationS / NOMINAL_STEP) },
          (_, i) => i * NOMINAL_STEP,
        );
    const intervals = frameTimes.slice(1).map((t, i) => t - frameTimes[i]);
    const sorted = [...intervals].sort((a, b) => a - b);
    const mid = usable ? median(intervals) : null;
    const issues = timing ? [...timing.issues] : ['NOT_MP4'];
    const blocking = ['COMPLEX_EDIT_LIST', 'FRAGMENTED', 'MALFORMED', 'NO_VIDEO_TRACK'];
    return {
      url,
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'unknown',
      width: meta.width,
      height: meta.height,
      durationS: meta.durationS,
      codec: timing?.codec ?? null,
      frameTimes,
      endS: usable ? timing.endS : meta.durationS,
      timebase: usable && !issues.some((i) => blocking.includes(i)) ? 'container' : 'unknown',
      timebaseIssues: issues,
      medianFrameIntervalS: mid,
      frameIntervalSpread:
        mid && sorted.length > 4
          ? (sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)]) /
            mid
          : null,
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};
/**
 * Shows frame `index` by seeking to the middle of its presentation interval. Where the browser
 * reports the presented frame's media time, it is compared with the container table.
 */
export function seekFrame(
  video: HTMLVideoElement,
  info: VideoInfo,
  index: number,
): Promise<'verified' | 'mismatch' | 'unverified'> {
  const t0 = info.frameTimes[index];
  const t1 = info.frameTimes[index + 1] ?? info.endS;
  const target = (t0 + t1) / 2;
  return new Promise((resolve) => {
    const v = video as FrameCallbackVideo;
    let settled = false;
    const done = (r: 'verified' | 'mismatch' | 'unverified') => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const timer = setTimeout(() => done('unverified'), 700);
    if (v.requestVideoFrameCallback && info.timebase === 'container')
      v.requestVideoFrameCallback((_, meta) => {
        clearTimeout(timer);
        done(
          Math.abs(meta.mediaTime - t0) <= Math.max(0.002, (t1 - t0) / 2) ? 'verified' : 'mismatch',
        );
      });
    else
      video.addEventListener(
        'seeked',
        () => {
          clearTimeout(timer);
          done('unverified');
        },
        { once: true },
      );
    if (Math.abs(video.currentTime - target) < 1e-6) {
      clearTimeout(timer);
      done('unverified');
    }
    video.currentTime = target;
  });
}
