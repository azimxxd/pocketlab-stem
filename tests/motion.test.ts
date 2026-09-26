import { describe, it, expect } from 'vitest';
import { analyzeMotion, createMotionDemo, monotonic } from '../packages/physics/motion';
import { motionInvestigationSchema, type MotionSample } from '../packages/contracts';
const still = (seconds: number, a = { x: 0, y: 0, z: 9.78 }, hz = 60): MotionSample[] =>
  Array.from({ length: Math.round(seconds * hz) }, (_, i) => ({
    t: i / hz,
    accelerationWithGravity: { ...a },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
  }));
describe('motion analysis (M2)', () => {
  const demo = analyzeMotion(createMotionDemo(), { simulation: true });
  it('reports the measured magnitude at rest instead of assuming g', () => {
    expect(demo.restMagnitude!.mean).toBeCloseTo(9.81, 1);
    const moon = analyzeMotion(still(3, { x: 0, y: 0, z: 1.62 }));
    expect(moon.restMagnitude!.mean).toBeCloseTo(1.62, 3);
  });
  it('finds three still intervals and two movements', () => {
    expect(demo.still).toHaveLength(3);
    expect(demo.movements).toHaveLength(2);
  });
  it('tilt from gravity matches the integrated gyroscope for a tilt about x', () => {
    const [tilt] = demo.movements;
    expect(tilt.tiltDeg).toBeCloseTo(90, 0);
    expect(tilt.dominantAxis).toBe('x');
    expect(Math.abs(tilt.gyroDeg!.x)).toBeGreaterThan(87);
    expect(Math.abs(tilt.gyroDeg!.x)).toBeLessThan(93);
  });
  it('rotation about the vertical is invisible to gravity tilt but seen by the gyroscope', () => {
    const spin = demo.movements[1];
    expect(spin.tiltDeg).toBeLessThan(2);
    expect(spin.dominantAxis).toBe('y');
    expect(Math.abs(spin.gyroDeg!.y)).toBeGreaterThan(175);
  });
  it('tilt does not depend on the platform acceleration sign convention', () => {
    const flipped = createMotionDemo().map((s) => ({
      ...s,
      accelerationWithGravity: s.accelerationWithGravity && {
        x: -s.accelerationWithGravity.x,
        y: -s.accelerationWithGravity.y,
        z: -s.accelerationWithGravity.z,
      },
    }));
    expect(analyzeMotion(flipped).movements[0].tiltDeg).toBeCloseTo(90, 0);
  });
  it('uses event timestamps: rate and gaps', () => {
    const samples = still(4);
    expect(analyzeMotion(samples).rateHz).toBeCloseTo(60, 0);
    const gapped = samples.filter((s) => s.t < 1.5 || s.t > 2.1);
    const result = analyzeMotion(gapped);
    expect(result.quality.reasons).toContain('TIME_GAP');
    expect(result.gaps.longestS).toBeGreaterThan(0.5);
    expect(result.still.length).toBe(2);
  });
  it('drops non-increasing timestamps instead of reordering', () => {
    const s = still(1);
    expect(monotonic([s[0], s[2], s[1], s[2], s[3]]).map((x) => x.t)).toEqual([
      s[0].t,
      s[2].t,
      s[3].t,
    ]);
  });
  it('keeps missing channels missing', () => {
    const noGyro = still(3).map((s) => ({ ...s, rotationRate: null }));
    const a = analyzeMotion(noGyro);
    expect(a.quality.reasons).toContain('NO_ROTATION_SENSOR');
    expect(a.peakRate).toEqual({ x: null, y: null, z: null });
    const noAccel = still(3).map((s) => ({ ...s, accelerationWithGravity: null }));
    const b = analyzeMotion(noAccel);
    expect(b.restMagnitude).toBeNull();
    expect(b.quality.status).toBe('invalid');
    expect(b.quality.reasons).toContain('NULL_SENSOR');
  });
  it('a moving phone has no still interval and no interpreted tilt', () => {
    const shaking = still(3).map((s, i) => ({
      ...s,
      accelerationWithGravity: { x: 3 * Math.sin(i), y: 0, z: 9.8 },
    }));
    const result = analyzeMotion(shaking);
    expect(result.still).toHaveLength(0);
    expect(result.restMagnitude).toBeNull();
    expect(result.quality.reasons).toContain('NO_STILL_SEGMENT');
  });
  it('short or interrupted recordings are flagged', () => {
    expect(analyzeMotion(still(1)).quality.status).toBe('invalid');
    expect(analyzeMotion(still(3), { interrupted: true }).quality.reasons).toContain('INTERRUPTED');
  });
  it('validates a stored record', () => {
    const samples = createMotionDemo();
    const now = new Date().toISOString();
    const doc = {
      schemaVersion: 2,
      scenarioId: 'motion-01',
      scenarioVersion: 1,
      id: crypto.randomUUID(),
      createdAt: now,
      provenance: 'simulation',
      hypothesis: 'Около 9,8 м/с²',
      hypothesisAt: now,
      conclusion: '',
      interrupted: false,
      reportedIntervalMs: null,
      samples,
      analysis: analyzeMotion(samples, { simulation: true }),
    };
    expect(motionInvestigationSchema.safeParse(doc).success).toBe(true);
    const zeroed = { ...doc, samples: [{ t: 0, accelerationWithGravity: { x: NaN, y: 0, z: 0 } }] };
    expect(motionInvestigationSchema.safeParse(zeroed).success).toBe(false);
  });
});
