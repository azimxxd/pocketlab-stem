/**
 * Test-only ISO BMFF writer: one VP9 video track with explicit decode/composition times and an
 * optional edit list. Used to build parser fixtures and a playable browser fixture.
 */
export type WriterSample = {
  data: Uint8Array;
  dts: number;
  cts?: number;
  duration: number;
  sync: boolean;
};
export type WriterOptions = {
  width: number;
  height: number;
  timescale: number;
  movieTimescale?: number;
  samples: WriterSample[];
  edits?: { durationMovie: number; mediaTime: number; rate?: number }[];
  moovAtEnd?: boolean;
};
const u8 = (...n: number[]) => Uint8Array.from(n);
function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
}
function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}
function i32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n);
  return b;
}
const str = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
const box = (type: string, ...payload: Uint8Array[]) => {
  const body = concat(payload);
  return concat([u32(body.length + 8), str(type), body]);
};
const full = (type: string, version: number, flags: number, ...payload: Uint8Array[]) =>
  box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...payload);
const matrix = concat([
  u32(0x10000),
  u32(0),
  u32(0),
  u32(0),
  u32(0x10000),
  u32(0),
  u32(0),
  u32(0),
  u32(0x40000000),
]);
export function writeMp4(o: WriterOptions): Uint8Array {
  const movieScale = o.movieTimescale ?? 1000;
  const last = o.samples.at(-1)!;
  const mediaDuration = last.dts + last.duration;
  const movieDuration = Math.round((mediaDuration / o.timescale) * movieScale);
  const ftyp = box(
    'ftyp',
    str('isom'),
    u32(512),
    str('isom'),
    str('iso2'),
    str('vp09'),
    str('mp41'),
  );
  const mdatBody = concat(o.samples.map((s) => s.data));
  const build = (chunkOffset: number) => {
    const vpcC = full('vpcC', 1, 0, u8(0, 10, (8 << 4) | (1 << 1), 1, 1, 1), u16(0));
    const vp09 = box(
      'vp09',
      new Uint8Array(6),
      u16(1),
      new Uint8Array(16),
      u16(o.width),
      u16(o.height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      new Uint8Array(32),
      u16(0x18),
      u16(0xffff),
      vpcC,
    );
    const runs = (values: number[]) => {
      const out: [number, number][] = [];
      for (const v of values) {
        if (out.length && out.at(-1)![1] === v) out.at(-1)![0]++;
        else out.push([1, v]);
      }
      return out;
    };
    const stts = runs(o.samples.map((s) => s.duration));
    const offsets = o.samples.map((s) => (s.cts ?? s.dts) - s.dts);
    const ctts = offsets.some((x) => x !== 0) ? runs(offsets) : null;
    const syncs = o.samples.flatMap((s, i) => (s.sync ? [i + 1] : []));
    const stbl = box(
      'stbl',
      full('stsd', 0, 0, u32(1), vp09),
      full('stts', 0, 0, u32(stts.length), ...stts.flatMap(([c, d]) => [u32(c), u32(d)])),
      ...(ctts
        ? [full('ctts', 1, 0, u32(ctts.length), ...ctts.flatMap(([c, d]) => [u32(c), i32(d)]))]
        : []),
      full('stss', 0, 0, u32(syncs.length), ...syncs.map(u32)),
      full('stsc', 0, 0, u32(1), u32(1), u32(o.samples.length), u32(1)),
      full(
        'stsz',
        0,
        0,
        u32(0),
        u32(o.samples.length),
        ...o.samples.map((s) => u32(s.data.length)),
      ),
      full('stco', 0, 0, u32(1), u32(chunkOffset)),
    );
    const minf = box(
      'minf',
      full('vmhd', 0, 1, new Uint8Array(8)),
      box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
      stbl,
    );
    const mdia = box(
      'mdia',
      full('mdhd', 0, 0, u32(0), u32(0), u32(o.timescale), u32(mediaDuration), u16(0x55c4), u16(0)),
      full('hdlr', 0, 0, u32(0), str('vide'), new Uint8Array(12), str('VideoHandler'), u8(0)),
      minf,
    );
    const edts = o.edits
      ? [
          box(
            'edts',
            full(
              'elst',
              0,
              0,
              u32(o.edits.length),
              ...o.edits.flatMap((e) => [
                u32(e.durationMovie),
                i32(e.mediaTime),
                u16(e.rate ?? 1),
                u16(0),
              ]),
            ),
          ),
        ]
      : [];
    const trak = box(
      'trak',
      full(
        'tkhd',
        0,
        3,
        u32(0),
        u32(0),
        u32(1),
        u32(0),
        u32(movieDuration),
        new Uint8Array(8),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        matrix,
        u32(o.width << 16),
        u32(o.height << 16),
      ),
      ...edts,
      mdia,
    );
    const mvhd = full(
      'mvhd',
      0,
      0,
      u32(0),
      u32(0),
      u32(movieScale),
      u32(movieDuration),
      u32(0x10000),
      u16(0x100),
      new Uint8Array(10),
      matrix,
      new Uint8Array(24),
      u32(2),
    );
    return box('moov', mvhd, trak);
  };
  const mdat = concat([u32(mdatBody.length + 8), str('mdat'), mdatBody]);
  if (o.moovAtEnd) {
    const moov = build(ftyp.length + 8);
    return concat([ftyp, mdat, moov]);
  }
  const size = build(0).length;
  const moov = build(ftyp.length + size + 8);
  return concat([ftyp, moov, mdat]);
}
