/**
 * Minimal ISO BMFF (MP4/MOV) timing reader. It reads only the tables that define when each video
 * frame is presented — stts (decode deltas), ctts (composition offsets), mdhd/mvhd timescales and
 * the edit list — and never touches sample data. Nominal «30 fps» is never assumed.
 */
export type TimebaseIssue =
  'NO_VIDEO_TRACK' | 'MULTIPLE_VIDEO_TRACKS' | 'COMPLEX_EDIT_LIST' | 'FRAGMENTED' | 'MALFORMED';
export type Mp4Timing = {
  codec: string | null;
  mediaTimescale: number;
  /** Presentation start time of every presented frame, seconds, ascending. */
  frameTimes: number[];
  /** Presentation end of the last frame, seconds. */
  endS: number;
  issues: TimebaseIssue[];
};
export type BoxHeader = { type: string; start: number; size: number; header: number };
const fourcc = (v: DataView, at: number) =>
  String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
/** Box header at `offset`; size 0 extends to `limit`. Returns null when it does not fit. */
export function readBoxHeader(v: DataView, offset: number, limit: number): BoxHeader | null {
  if (offset + 8 > limit) return null;
  let size = v.getUint32(offset);
  const type = fourcc(v, offset + 4);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    size = Number(v.getBigUint64(offset + 8));
    header = 16;
  } else if (size === 0) size = limit - offset;
  if (size < header) return null;
  return { type, start: offset, size, header };
}
function children(v: DataView, box: BoxHeader, skip = 0): BoxHeader[] {
  const out: BoxHeader[] = [];
  const end = Math.min(v.byteLength, box.start + box.size);
  for (let at = box.start + box.header + skip; at < end;) {
    const child = readBoxHeader(v, at, end);
    if (!child) break;
    out.push(child);
    at += child.size;
  }
  return out;
}
const find = (v: DataView, box: BoxHeader | undefined, type: string) =>
  box ? children(v, box).find((c) => c.type === type) : undefined;
/** mvhd and mdhd share the layout up to the timescale. */
function timescaleOf(v: DataView, box: BoxHeader) {
  const body = box.start + box.header;
  return v.getUint32(body + (v.getUint8(body) === 1 ? 20 : 12));
}
type Edit = { durationMovie: number; mediaTime: number; rate: number };
function editsOf(v: DataView, trak: BoxHeader): Edit[] {
  const elst = find(v, find(v, trak, 'edts'), 'elst');
  if (!elst) return [];
  const body = elst.start + elst.header;
  const version = v.getUint8(body);
  const count = v.getUint32(body + 4);
  const out: Edit[] = [];
  let at = body + 8;
  for (let i = 0; i < count; i++) {
    if (version === 1) {
      out.push({
        durationMovie: Number(v.getBigUint64(at)),
        mediaTime: Number(v.getBigInt64(at + 8)),
        rate: v.getInt16(at + 16),
      });
      at += 20;
    } else {
      out.push({
        durationMovie: v.getUint32(at),
        mediaTime: v.getInt32(at + 4),
        rate: v.getInt16(at + 8),
      });
      at += 12;
    }
  }
  return out;
}
/** Parses the bytes of a complete `moov` box (header included). */
export function parseMoov(bytes: Uint8Array): Mp4Timing {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (issue: TimebaseIssue): Mp4Timing => ({
    codec: null,
    mediaTimescale: 0,
    frameTimes: [],
    endS: 0,
    issues: [issue],
  });
  try {
    const moov = readBoxHeader(v, 0, v.byteLength);
    if (!moov || moov.type !== 'moov') return fail('MALFORMED');
    const mvhd = find(v, moov, 'mvhd');
    if (!mvhd) return fail('MALFORMED');
    const movieScale = timescaleOf(v, mvhd);
    const video = children(v, moov)
      .filter((c) => c.type === 'trak')
      .filter((trak) => {
        const hdlr = find(v, find(v, trak, 'mdia'), 'hdlr');
        return hdlr && fourcc(v, hdlr.start + hdlr.header + 8) === 'vide';
      });
    if (!video.length) return fail('NO_VIDEO_TRACK');
    const trak = video[0];
    const issues: TimebaseIssue[] = video.length > 1 ? ['MULTIPLE_VIDEO_TRACKS'] : [];
    const mdia = find(v, trak, 'mdia');
    const mdhd = find(v, mdia, 'mdhd');
    const stbl = find(v, find(v, mdia, 'minf'), 'stbl');
    const stts = find(v, stbl, 'stts');
    if (!mdhd || !stbl || !stts) return fail('MALFORMED');
    const scale = timescaleOf(v, mdhd);
    const stsd = find(v, stbl, 'stsd');
    const codec = stsd ? fourcc(v, stsd.start + stsd.header + 12) : null;
    // Decode times from stts.
    const dts: number[] = [];
    let t = 0;
    const sttsBody = stts.start + stts.header;
    for (let i = 0, n = v.getUint32(sttsBody + 4); i < n; i++) {
      const count = v.getUint32(sttsBody + 8 + i * 8),
        delta = v.getUint32(sttsBody + 12 + i * 8);
      for (let k = 0; k < count; k++) {
        dts.push(t);
        t += delta;
      }
    }
    const decodeEnd = t;
    // Composition offsets (B-frames) from ctts; version 1 offsets are signed.
    const cts = [...dts];
    const ctts = find(v, stbl, 'ctts');
    if (ctts) {
      const body = ctts.start + ctts.header;
      const signed = v.getUint8(body) === 1;
      let s = 0;
      for (let i = 0, n = v.getUint32(body + 4); i < n; i++) {
        const count = v.getUint32(body + 8 + i * 8);
        const offset = signed ? v.getInt32(body + 12 + i * 8) : v.getUint32(body + 12 + i * 8);
        for (let k = 0; k < count && s < cts.length; k++) cts[s++] += offset;
      }
    }
    const sorted = [...cts].sort((a, b) => a - b);
    // Edit list: leading empty edits delay presentation; one media edit selects the start.
    const edits = editsOf(v, trak);
    let delayS = 0,
      mediaStart = 0,
      mediaEnd = Infinity;
    const media = edits.filter((e) => e.mediaTime !== -1);
    for (const e of edits) {
      if (e.mediaTime !== -1) break;
      delayS += e.durationMovie / movieScale;
    }
    if (media.length > 1 || media.some((e) => e.rate !== 1)) issues.push('COMPLEX_EDIT_LIST');
    if (media[0]) {
      mediaStart = media[0].mediaTime;
      if (media[0].durationMovie > 0)
        mediaEnd = mediaStart + (media[0].durationMovie / movieScale) * scale;
    }
    const frameTimes = sorted
      .filter((c) => c >= mediaStart && c < mediaEnd)
      .map((c) => delayS + (c - mediaStart) / scale);
    const lastEnd = Math.min(mediaEnd, Math.max(decodeEnd, sorted.at(-1)! + 1));
    return {
      codec,
      mediaTimescale: scale,
      frameTimes,
      endS: delayS + (lastEnd - mediaStart) / scale,
      issues,
    };
  } catch {
    return fail('MALFORMED');
  }
}
/**
 * Locates the top-level `moov` (or detects fragmentation) by reading only box headers, so a
 * 100 MB file is never loaded into memory. `read(start, end)` returns bytes of that range.
 */
export async function readMp4Timing(
  size: number,
  read: (start: number, end: number) => Promise<Uint8Array>,
): Promise<Mp4Timing | null> {
  let moov: BoxHeader | null = null,
    fragmented = false;
  for (let at = 0, guard = 0; at < size && guard < 10000; guard++) {
    const head = await read(at, Math.min(size, at + 16));
    const box = readBoxHeader(
      new DataView(head.buffer, head.byteOffset, head.byteLength),
      0,
      size - at,
    );
    if (!box) break;
    if (box.type === 'moov') moov = { ...box, start: at };
    if (box.type === 'moof') fragmented = true;
    at += box.size;
  }
  if (!moov) return null;
  const timing = parseMoov(await read(moov.start, moov.start + moov.size));
  if (fragmented) timing.issues.push('FRAGMENTED');
  return timing;
}
