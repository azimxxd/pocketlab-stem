import { describe, it, expect } from 'vitest';
import { match, startTracker, step, type Gray } from '../packages/vision/tracker';
/** Frame with anti-aliased disks (4×4 supersampling), background level and pseudo-noise. */
function frame(
  disks: { x: number; y: number; r?: number; level?: number }[],
  { width = 160, height = 120, background = 30, noise = 2, gain = 1 } = {},
): Gray {
  const data = new Float32Array(width * height);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let v = background;
      for (const d of disks) {
        const r = d.r ?? 6;
        if (Math.abs(x - d.x) > r + 1 || Math.abs(y - d.y) > r + 1) continue;
        let cover = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++)
            if (Math.hypot(x + (sx + 0.5) / 4 - 0.5 - d.x, y + (sy + 0.5) / 4 - 0.5 - d.y) <= r)
              cover++;
        v += (cover / 16) * ((d.level ?? 220) - background);
      }
      data[y * width + x] = gain * (v + noise * rand());
    }
  return { width, height, data };
}
const path = (i: number) => ({ x: 20 + 6.3 * i, y: 20 + 2.1 * i + 0.35 * i * i });
describe('NCC template tracker', () => {
  it('follows an accelerating ball with sub-pixel accuracy', () => {
    let state = startTracker(frame([path(0)]), path(0).x, path(0).y, 8)!;
    for (let i = 1; i <= 12; i++) {
      const result = step(state, frame([path(i)]));
      expect(result.status).toBe('ok');
      expect(Math.abs(result.point!.x - path(i).x)).toBeLessThan(0.35);
      expect(Math.abs(result.point!.y - path(i).y)).toBeLessThan(0.35);
      state = result.state;
    }
  });
  it('is insensitive to a brightness and contrast change', () => {
    const state = startTracker(frame([{ x: 50, y: 50 }]), 50, 50, 8)!;
    const result = step(state, frame([{ x: 53.4, y: 51.2 }], { gain: 0.55, background: 60 }));
    expect(result.status).toBe('ok');
    expect(result.point!.x).toBeCloseTo(53.4, 0);
  });
  it('reports loss when the ball disappears instead of continuing the path', () => {
    const state = startTracker(frame([{ x: 50, y: 50 }]), 50, 50, 8)!;
    const moved = step(state, frame([{ x: 56, y: 52 }])).state;
    const result = step(moved, frame([]));
    expect(result.status).toBe('lost');
    expect(result.state.last).toEqual(moved.last);
  });
  it('flags an identical ball next to the target as ambiguous', () => {
    const state = startTracker(frame([{ x: 50, y: 50 }]), 50, 50, 8)!;
    const result = step(
      state,
      frame([
        { x: 51, y: 50 },
        // Within the search window (2r = 16 px before any velocity is known).
        { x: 64, y: 50 },
      ]),
    );
    expect(result.status).toBe('ambiguous');
  });
  it('reports leaving the frame', () => {
    let state = startTracker(frame([{ x: 140, y: 60 }]), 140, 60, 6)!;
    state = step(state, frame([{ x: 152, y: 60 }])).state;
    expect(['out', 'lost']).toContain(step(state, frame([])).status);
    state = { ...state, velocity: { x: 40, y: 0 } };
    expect(step(state, frame([])).status).toBe('out');
  });
  it('scales the prediction with variable frame intervals', () => {
    let state = startTracker(frame([{ x: 20, y: 60 }]), 20, 60, 6)!;
    state = step(state, frame([{ x: 30, y: 60 }])).state;
    // Next interval is twice as long: the ball moves 20 px, beyond a fixed-ratio search.
    const result = step(state, frame([{ x: 50, y: 60 }]), 2);
    expect(result.status).toBe('ok');
    expect(result.point!.x).toBeCloseTo(50, 0);
  });
  it('does not start on a flat patch', () => {
    expect(startTracker(frame([], { noise: 0 }), 50, 50, 8)).toBeNull();
    expect(match(frame([]), { r: 3, data: new Float32Array(49), norm: 0 }, 5, 5, 0)).not.toBeNull();
  });
});
