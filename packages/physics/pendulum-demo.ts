import type { PendulumTrial } from '../contracts/pendulum';
/** Explicit deterministic illustration. This constant is never used in real-data fitting. */
export function createPendulumDemo(): PendulumTrial[] {
  return [0.2, 0.35, 0.5, 0.75, 1].flatMap((lengthM, index) =>
    [-0.12, 0.07, 0.02].map((offset, repeat) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      provenance: 'simulation' as const,
      acquisitionKind: 'simulation' as const,
      input: {
        lengthM,
        cycles: 10,
        elapsedS: 20 * Math.PI * Math.sqrt(lengthM / 9.81) + offset + (index % 2) * 0.03,
        lengthErrorM: 0.005,
        timingErrorS: 0.3,
      },
    })),
  );
}
