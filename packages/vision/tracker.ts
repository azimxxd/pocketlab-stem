/**
 * Template tracker: normalised cross-correlation (NCC) of a square patch around the object,
 * searched near a constant-velocity prediction. NCC is invariant to brightness and contrast
 * changes. The prediction only centres the search; it never becomes an output position.
 */
export type Gray = { width: number; height: number; data: Float32Array };
export type Template = { r: number; data: Float32Array; norm: number };
export type Match = { x: number; y: number; score: number; second: number };
export type StepStatus = 'ok' | 'ambiguous' | 'lost' | 'out';
export const TRACKER = {
  algorithmVersion: 'ncc-v1' as const,
  /** Below this correlation the object is considered lost. */
  lost: 0.5,
  /** A second peak this close to the best one makes the match ambiguous. */
  ambiguity: 0.05,
  /** Template adapts slowly only on confident matches. */
  adaptAbove: 0.85,
  adaptRate: 0.2,
};
export function toGray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++)
    data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return { width, height, data };
}
const inside = (g: Gray, cx: number, cy: number, r: number) =>
  cx - r >= 0 && cy - r >= 0 && cx + r < g.width && cy + r < g.height;
function zeroMean(values: Float32Array): Template['data'] {
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  return values.map((v) => v - mean);
}
const normOf = (d: Float32Array) => Math.sqrt(d.reduce((s, v) => s + v * v, 0));
/** Square patch of side 2r+1 centred on the rounded point; null if it leaves the frame or is flat. */
export function cutTemplate(g: Gray, x: number, y: number, r: number): Template | null {
  const cx = Math.round(x),
    cy = Math.round(y);
  if (!inside(g, cx, cy, r)) return null;
  const side = 2 * r + 1;
  const patch = new Float32Array(side * side);
  for (let j = 0; j < side; j++)
    for (let i = 0; i < side; i++)
      patch[j * side + i] = g.data[(cy - r + j) * g.width + cx - r + i];
  const data = zeroMean(patch);
  const norm = normOf(data);
  return norm > 1e-3 ? { r, data, norm } : null;
}
/** NCC over candidate centres within `search` px of (px, py), with sub-pixel peak refinement. */
export function match(g: Gray, t: Template, px: number, py: number, search: number): Match | null {
  const { r } = t,
    side = 2 * r + 1,
    n = side * side;
  const x0 = Math.max(r, Math.round(px - search)),
    x1 = Math.min(g.width - r - 1, Math.round(px + search));
  const y0 = Math.max(r, Math.round(py - search)),
    y1 = Math.min(g.height - r - 1, Math.round(py + search));
  if (x0 > x1 || y0 > y1) return null;
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1;
  const scores = new Float32Array(w * h).fill(-1);
  let best = -1,
    bx = 0,
    by = 0;
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      let sum = 0,
        sq = 0,
        cross = 0;
      for (let j = 0; j < side; j++) {
        const row = (cy - r + j) * g.width + cx - r;
        const trow = j * side;
        for (let i = 0; i < side; i++) {
          const v = g.data[row + i];
          sum += v;
          sq += v * v;
          cross += v * t.data[trow + i];
        }
      }
      const variance = sq - (sum * sum) / n;
      const score = variance > 1e-6 ? cross / (t.norm * Math.sqrt(variance)) : 0;
      scores[(cy - y0) * w + cx - x0] = score;
      if (score > best) {
        best = score;
        bx = cx;
        by = cy;
      }
    }
  let second = -1;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (Math.hypot(x0 + i - bx, y0 + j - by) > r) second = Math.max(second, scores[j * w + i]);
  const at = (x: number, y: number) =>
    x < x0 || x > x1 || y < y0 || y > y1 ? null : scores[(y - y0) * w + x - x0];
  const refine = (a: number | null, c: number, b: number | null) => {
    if (a === null || b === null) return 0;
    const curvature = a - 2 * c + b;
    return curvature < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - b)) / curvature)) : 0;
  };
  return {
    x: bx + refine(at(bx - 1, by), best, at(bx + 1, by)),
    y: by + refine(at(bx, by - 1), best, at(bx, by + 1)),
    score: best,
    second,
  };
}
export type TrackerState = {
  template: Template;
  last: { x: number; y: number };
  velocity: { x: number; y: number } | null;
};
export function startTracker(g: Gray, x: number, y: number, r: number): TrackerState | null {
  const template = cutTemplate(g, x, y, r);
  return template ? { template, last: { x, y }, velocity: null } : null;
}
/**
 * One frame. `dtRatio` = (this frame interval) / (previous interval) scales the velocity for
 * variable frame rates. Returns the new state and the measured position, or a stop status.
 */
export function step(
  state: TrackerState,
  g: Gray,
  dtRatio = 1,
): { status: StepStatus; state: TrackerState; point: Match | null } {
  const r = state.template.r;
  const v = state.velocity ?? { x: 0, y: 0 };
  const predicted = { x: state.last.x + v.x * dtRatio, y: state.last.y + v.y * dtRatio };
  if (
    predicted.x < -r ||
    predicted.y < -r ||
    predicted.x > g.width + r ||
    predicted.y > g.height + r
  )
    return { status: 'out', state, point: null };
  const search = Math.max(2 * r, 1.5 * Math.hypot(v.x, v.y) * dtRatio + r);
  const m = match(g, state.template, predicted.x, predicted.y, search);
  if (!m || m.score < TRACKER.lost) return { status: 'lost', state, point: m };
  const status: StepStatus =
    m.second > TRACKER.lost && m.second >= m.score - TRACKER.ambiguity ? 'ambiguous' : 'ok';
  let template = state.template;
  if (status === 'ok' && m.score > TRACKER.adaptAbove) {
    const fresh = cutTemplate(g, m.x, m.y, r);
    if (fresh) {
      const blended = zeroMean(
        template.data.map(
          (val, i) => (1 - TRACKER.adaptRate) * val + TRACKER.adaptRate * fresh.data[i],
        ),
      );
      template = { r, data: blended, norm: normOf(blended) };
    }
  }
  return {
    status,
    point: m,
    state: {
      template,
      last: { x: m.x, y: m.y },
      // Displacement over this interval; the next step scales it by the next interval ratio.
      velocity: { x: m.x - state.last.x, y: m.y - state.last.y },
    },
  };
}
