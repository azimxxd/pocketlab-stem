import { z } from 'zod';
const finite = z.number().finite();
const vec = z.object({ x: finite, y: finite, z: finite });
/**
 * One devicemotion event. Time in seconds from the first event (event timestamps, not delivery).
 * A missing channel is null — never zero.
 */
export const motionSampleSchema = z.object({
  t: finite.nonnegative(),
  accelerationWithGravity: vec.nullable(),
  /** deg/s as reported: alpha about device z, beta about x, gamma about y. */
  rotationRate: z.object({ alpha: finite, beta: finite, gamma: finite }).nullable(),
});
export const motionIssueSchema = z.enum([
  'TOO_FEW_SAMPLES',
  'TIME_GAP',
  'NULL_SENSOR',
  'NO_ROTATION_SENSOR',
  'NO_STILL_SEGMENT',
  'INTERRUPTED',
  'DEMO_DATA',
]);
export type MotionIssue = z.infer<typeof motionIssueSchema>;
const axisSchema = z.enum(['x', 'y', 'z']);
export type Axis = z.infer<typeof axisSchema>;
export const motionAnalysisSchema = z.object({
  algorithmVersion: z.literal('motion-v1'),
  sampleCount: z.number().int().nonnegative(),
  durationS: finite.nonnegative(),
  rateHz: finite.positive().nullable(),
  medianIntervalS: finite.positive().nullable(),
  gaps: z.object({ count: z.number().int().nonnegative(), longestS: finite.nonnegative() }),
  accelerationSamples: z.number().int().nonnegative(),
  rotationSamples: z.number().int().nonnegative(),
  /** Quasi-static intervals: the only place where gravity projections are interpreted. */
  still: z
    .array(
      z.object({
        startS: finite,
        endS: finite,
        meanMagnitude: finite.nonnegative(),
        sdMagnitude: finite.nonnegative(),
        gravity: vec,
      }),
    )
    .max(50),
  restMagnitude: z
    .object({ mean: finite, sd: finite.nonnegative(), samples: z.number().int().positive() })
    .nullable(),
  /** Movement between consecutive still intervals: gravity tilt vs integrated gyroscope. */
  movements: z
    .array(
      z.object({
        startS: finite,
        endS: finite,
        tiltDeg: finite.min(0).max(180),
        gyroDeg: z.object({ x: finite, y: finite, z: finite }).nullable(),
        dominantAxis: axisSchema.nullable(),
        spansGap: z.boolean(),
      }),
    )
    .max(50),
  peakRate: z.object({ x: finite.nullable(), y: finite.nullable(), z: finite.nullable() }),
  quality: z.object({
    status: z.enum(['valid', 'warning', 'invalid']),
    reasons: z.array(motionIssueSchema),
  }),
});
export type MotionAnalysis = z.infer<typeof motionAnalysisSchema>;
export const motionInvestigationSchema = z.object({
  schemaVersion: z.literal(2),
  scenarioId: z.literal('motion-01'),
  scenarioVersion: z.literal(1),
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  provenance: z.enum(['live', 'simulation']),
  hypothesis: z.string().min(1).max(1000),
  hypothesisAt: z.string().datetime(),
  conclusion: z.string().max(3000),
  interrupted: z.boolean(),
  /** Median event.interval reported by the browser, diagnostic only. */
  reportedIntervalMs: finite.positive().nullable(),
  samples: z.array(motionSampleSchema).min(1).max(12000),
  analysis: motionAnalysisSchema,
});
export type MotionInvestigation = z.infer<typeof motionInvestigationSchema>;
