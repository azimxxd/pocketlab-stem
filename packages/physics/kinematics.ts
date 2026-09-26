import type { FlightAnalysis, BounceAnalysis, TrackPoint, VideoIssue } from '../contracts';
export type Px = { x: number; y: number };
export const distancePx = (a: Px, b: Px) => Math.hypot(a.x - b.x, a.y - b.y);
type Quadratic = {
  /** y = c0 + c1·τ + c2·τ², τ = t − tMean. */
  c0: number;
  c1: number;
  c2: number;
  se2: number | null;
  tMean: number;
  rms: number;
};
/** Ordinary least squares for a parabola, with the standard error of c2 from the residuals. */
export function fitQuadratic(t: number[], y: number[]): Quadratic | null {
  const n = t.length;
  if (n < 3) return null;
  const tMean = t.reduce((a, b) => a + b, 0) / n;
  const s = [0, 0, 0, 0, 0],
    r = [0, 0, 0];
  t.forEach((ti, i) => {
    const tau = ti - tMean;
    for (let k = 0; k < 5; k++) s[k] += tau ** k;
    for (let k = 0; k < 3; k++) r[k] += y[i] * tau ** k;
  });
  const m = [
    [s[0], s[1], s[2]],
    [s[1], s[2], s[3]],
    [s[2], s[3], s[4]],
  ];
  const det =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (!(Math.abs(det) > 1e-18)) return null;
  const inv = [
    [
      m[1][1] * m[2][2] - m[1][2] * m[2][1],
      m[0][2] * m[2][1] - m[0][1] * m[2][2],
      m[0][1] * m[1][2] - m[0][2] * m[1][1],
    ],
    [
      m[1][2] * m[2][0] - m[1][0] * m[2][2],
      m[0][0] * m[2][2] - m[0][2] * m[2][0],
      m[0][2] * m[1][0] - m[0][0] * m[1][2],
    ],
    [
      m[1][0] * m[2][1] - m[1][1] * m[2][0],
      m[0][1] * m[2][0] - m[0][0] * m[2][1],
      m[0][0] * m[1][1] - m[0][1] * m[1][0],
    ],
  ].map((row) => row.map((v) => v / det));
  const [c0, c1, c2] = inv.map((row) => row[0] * r[0] + row[1] * r[1] + row[2] * r[2]);
  const residuals = t.map((ti, i) => {
    const tau = ti - tMean;
    return y[i] - (c0 + c1 * tau + c2 * tau * tau);
  });
  const rss = residuals.reduce((a, b) => a + b * b, 0);
  return {
    c0,
    c1,
    c2,
    se2: n > 3 ? Math.sqrt((rss / (n - 3)) * inv[2][2]) : null,
    tMean,
    rms: Math.sqrt(rss / n),
  };
}
export type FlightOptions = {
  /** Metres per displayed video pixel, or null when no scale is set. */
  metersPerPx: number | null;
  /** Relative bound of the scale (length bound + click bound on the segment). */
  scaleRelBound: number;
  /** Real seconds per media second is 1/timeFactor; null = playback speed unknown. */
  timeFactor: number | null;
  timebaseKnown: boolean;
  clickErrorPx: number;
  simulation?: boolean;
};
/** Points in display pixels → metres (y up) and real seconds, relative to the first point. */
export function toWorld(points: TrackPoint[], metersPerPx: number, timeFactor: number) {
  const [p0] = points;
  return points.map((p) => ({
    t: (p.t - p0.t) / timeFactor,
    x: (p.x - p0.x) * metersPerPx,
    y: -(p.y - p0.y) * metersPerPx,
  }));
}
/**
 * V1: fit x(t) and y(t) with parabolas. |a| from both axes does not depend on camera roll; the
 * direction of a shows how far the image «down» is from the true vertical.
 */
export function analyzeFlight(raw: TrackPoint[], o: FlightOptions): FlightAnalysis {
  const points = [...raw].sort((a, b) => a.t - b.t);
  const reasons: VideoIssue[] = [];
  const factor = o.timeFactor ?? 1;
  const s = o.metersPerPx ?? 1;
  const world = points.length ? toWorld(points, s, factor) : [];
  const span = world.at(-1)?.t ?? 0;
  if (points.length < 6) reasons.push('TOO_FEW_POINTS');
  if (span < 0.15) reasons.push('SHORT_INTERVAL');
  if (!o.timebaseKnown || o.timeFactor === null) reasons.push('TIME_SCALE_UNKNOWN');
  if (o.metersPerPx === null) reasons.push('SCALE_MISSING');
  else if (o.scaleRelBound > 0.05) reasons.push('SCALE_UNCERTAIN');
  if (points.some((p) => p.uncertain)) reasons.push('UNCERTAIN_POINTS');
  if (o.simulation) reasons.push('DEMO_DATA');
  const fx = fitQuadratic(
    world.map((p) => p.t),
    world.map((p) => p.x),
  );
  const fy = fitQuadratic(
    world.map((p) => p.t),
    world.map((p) => p.y),
  );
  let acceleration: FlightAnalysis['acceleration'] = null;
  if (fx && fy) {
    const ax = 2 * fx.c2,
      ay = 2 * fy.c2;
    const magnitude = Math.hypot(ax, ay);
    const se =
      fx.se2 !== null && fy.se2 !== null && magnitude > 0
        ? (2 * Math.hypot(ax * fx.se2, ay * fy.se2)) / magnitude
        : null;
    const rmsPx = Math.hypot(fx.rms, fy.rms) / s;
    if (rmsPx > 3 * o.clickErrorPx && points.length >= 6) reasons.push('MODEL_ASSUMPTION');
    acceleration = {
      ax,
      ay,
      magnitude,
      statSe: se,
      scaleBound: magnitude * o.scaleRelBound,
      tiltDeg: (Math.atan2(ax, -ay) * 180) / Math.PI,
      rmsPx,
      fitX: { c0: fx.c0, c1: fx.c1, c2: fx.c2, tMean: fx.tMean },
      fitY: { c0: fy.c0, c1: fy.c1, c2: fy.c2, tMean: fy.tMean },
    };
  }
  const blocking: VideoIssue[] = [
    'TOO_FEW_POINTS',
    'SHORT_INTERVAL',
    'TIME_SCALE_UNKNOWN',
    'SCALE_MISSING',
    'MODEL_ASSUMPTION',
  ];
  const usable = acceleration !== null && !reasons.some((r) => blocking.includes(r));
  return {
    algorithmVersion: 'flight-v1',
    points: points.length,
    spanS: span,
    acceleration,
    g: usable ? acceleration!.magnitude : null,
    quality: {
      status: usable ? (reasons.length ? 'warning' : 'valid') : 'invalid',
      reasons,
    },
  };
}
/**
 * V2: parabolas before and after the marked contact frame; apex height of the ball centre above
 * its centre at contact. h2/h1 needs neither the metre scale nor the time unit — only one plane
 * and consistent frame times.
 */
export function analyzeBounce(
  raw: TrackPoint[],
  contactFrame: number | null,
  o: { timebaseKnown: boolean; simulation?: boolean },
): BounceAnalysis {
  const points = [...raw].sort((a, b) => a.t - b.t);
  const reasons: VideoIssue[] = [];
  if (!o.timebaseKnown) reasons.push('TIME_SCALE_UNKNOWN');
  if (o.simulation) reasons.push('DEMO_DATA');
  if (points.some((p) => p.uncertain)) reasons.push('UNCERTAIN_POINTS');
  const contact = points.find((p) => p.frame === contactFrame);
  const invalid = (reason: VideoIssue): BounceAnalysis => ({
    algorithmVersion: 'bounce-v1',
    h1Px: null,
    h2Px: null,
    ratio: null,
    restitution: null,
    arcs: [],
    quality: { status: 'invalid', reasons: [...reasons, reason] },
  });
  if (!contact) return invalid('CONTACT_MISSING');
  const arcs = [points.filter((p) => p.t < contact.t), points.filter((p) => p.t > contact.t)].map(
    (arc) => {
      if (arc.length < 5) return null;
      // Height above the contact position, in pixels, y up.
      const fit = fitQuadratic(
        arc.map((p) => p.t),
        arc.map((p) => contact.y - p.y),
      );
      if (!fit || !(fit.c2 < 0)) return null;
      const tau = -fit.c1 / (2 * fit.c2);
      const tApex = fit.tMean + tau;
      const width = arc.at(-1)!.t - arc[0].t;
      return {
        points: arc.length,
        heightPx: fit.c0 - (fit.c1 * fit.c1) / (4 * fit.c2),
        apexT: tApex,
        extrapolated: tApex < arc[0].t - 0.1 * width || tApex > arc.at(-1)!.t + 0.1 * width,
      };
    },
  );
  if (!arcs[0] || !arcs[1]) return invalid('TOO_FEW_POINTS');
  if (arcs.some((a) => a!.extrapolated)) reasons.push('APEX_EXTRAPOLATED');
  const [h1, h2] = [arcs[0].heightPx, arcs[1].heightPx];
  const ratio = h1 > 0 && h2 > 0 ? h2 / h1 : null;
  if (ratio === null || ratio > 1.05) reasons.push('MODEL_ASSUMPTION');
  const blocking = ratio === null || reasons.includes('TIME_SCALE_UNKNOWN');
  return {
    algorithmVersion: 'bounce-v1',
    h1Px: h1,
    h2Px: h2,
    ratio,
    restitution: ratio !== null && ratio <= 1 ? Math.sqrt(ratio) : null,
    arcs: arcs as NonNullable<(typeof arcs)[number]>[],
    quality: {
      status: blocking ? 'invalid' : reasons.length ? 'warning' : 'valid',
      reasons,
    },
  };
}
/**
 * Explicit synthetic track: a ball thrown sideways at 30 fps, 1 px = 2 mm, g = 9.81 m/s² in the
 * generator, ±1 px deterministic noise. Not a video and not a measurement.
 */
export function createFlightDemo(): TrackPoint[] {
  const s = 0.002;
  return Array.from({ length: 16 }, (_, i) => {
    const t = i / 30;
    const noise = (k: number) => Math.sin(i * (2.1 + k) + k);
    return {
      frame: i,
      t,
      x: 120 + (1.1 * t) / s + noise(0),
      y: 80 - (0.4 * t - 0.5 * 9.81 * t * t) / s + noise(1),
      uncertain: false,
    };
  });
}
