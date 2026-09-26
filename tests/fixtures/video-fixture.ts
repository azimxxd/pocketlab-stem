/** Parameters of tests/fixtures/video/throw-vfr.mp4 (display pixels, y down, seconds). */
const intervals = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.037 : 0.03));
export const FIXTURE = {
  width: 320,
  height: 240,
  /** Frame presentation times with alternating 30/37 ms intervals (variable frame rate). */
  times: intervals.reduce<number[]>((acc, d) => [...acc, acc.at(-1)! + d], [0]),
  ruler: { x: 290, y1: 20, y2: 220, lengthM: 0.5 },
  x0: 60,
  y0: 150,
  vx: 300,
  vy: -560,
  /** 9.81 m/s² with 200 px = 0.5 m. */
  a: 3924,
};
export const ballAt = (t: number) => ({
  x: FIXTURE.x0 + FIXTURE.vx * t,
  y: FIXTURE.y0 + FIXTURE.vy * t + 0.5 * FIXTURE.a * t * t,
});
