import { z } from 'zod';
const finite = z.number().finite();
const px = z.object({ x: finite, y: finite });
export const videoIssueSchema = z.enum([
  'TOO_FEW_POINTS',
  'SHORT_INTERVAL',
  'TIME_SCALE_UNKNOWN',
  'SCALE_MISSING',
  'SCALE_UNCERTAIN',
  'MODEL_ASSUMPTION',
  'UNCERTAIN_POINTS',
  'CONTACT_MISSING',
  'AUTO_POINTS',
  'TRACK_LOST',
  'APEX_EXTRAPOLATED',
  'DEMO_DATA',
]);
export type VideoIssue = z.infer<typeof videoIssueSchema>;
/**
 * One mark: media time of the frame (s) and position in displayed video pixels, y down.
 * `method` tells who placed it; records from before auto-tracking are manual.
 */
export const trackPointSchema = z.object({
  frame: z.number().int().nonnegative(),
  t: finite.nonnegative(),
  x: finite,
  y: finite,
  uncertain: z.boolean(),
  method: z.enum(['manual', 'auto', 'generated']).default('manual'),
  /** Tracker correlation for automatic marks. */
  score: finite.min(-1).max(1).nullable().default(null),
});
/** Unmodified output of one tracker run; corrections live in `points`, never here. */
export const autoRunSchema = z.object({
  id: z.string().uuid(),
  algorithmVersion: z.literal('ncc-v1'),
  startFrame: z.number().int().nonnegative(),
  radiusPx: finite.positive(),
  downscale: finite.positive().max(1),
  points: z
    .array(
      z.object({
        frame: z.number().int().nonnegative(),
        t: finite.nonnegative(),
        x: finite,
        y: finite,
        score: finite.min(-1).max(1),
        ambiguous: z.boolean(),
      }),
    )
    .max(3000),
  stop: z.object({
    frame: z.number().int().nonnegative().nullable(),
    reason: z.enum(['LOST', 'OUT_OF_FRAME', 'END', 'CANCELLED', 'AMBIGUOUS']),
    score: finite.nullable(),
  }),
});
export type AutoRun = z.infer<typeof autoRunSchema>;
export type TrackPoint = z.infer<typeof trackPointSchema>;
const quality = z.object({
  status: z.enum(['valid', 'warning', 'invalid']),
  reasons: z.array(videoIssueSchema),
});
const fit = z.object({ c0: finite, c1: finite, c2: finite, tMean: finite });
export const flightAnalysisSchema = z.object({
  algorithmVersion: z.literal('flight-v1'),
  points: z.number().int().nonnegative(),
  spanS: finite.nonnegative(),
  acceleration: z
    .object({
      ax: finite,
      ay: finite,
      magnitude: finite.nonnegative(),
      statSe: finite.nonnegative().nullable(),
      scaleBound: finite.nonnegative(),
      /** Angle of a from image «down», degrees: camera roll or non-vertical motion plane. */
      tiltDeg: finite,
      rmsPx: finite.nonnegative(),
      fitX: fit,
      fitY: fit,
    })
    .nullable(),
  /** |a| offered as an estimate of g only when time, scale and the model are usable. */
  g: finite.positive().nullable(),
  quality,
});
export type FlightAnalysis = z.infer<typeof flightAnalysisSchema>;
export const bounceAnalysisSchema = z.object({
  algorithmVersion: z.literal('bounce-v1'),
  h1Px: finite.nullable(),
  h2Px: finite.nullable(),
  ratio: finite.nonnegative().nullable(),
  restitution: finite.nonnegative().nullable(),
  arcs: z.array(
    z.object({
      points: z.number().int().positive(),
      heightPx: finite,
      apexT: finite,
      extrapolated: z.boolean(),
    }),
  ),
  quality,
});
export type BounceAnalysis = z.infer<typeof bounceAnalysisSchema>;
export const videoInvestigationSchema = z
  .object({
    schemaVersion: z.literal(2),
    scenarioId: z.literal('video-01'),
    scenarioVersion: z.literal(1),
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    /** Imported video file (never stored) or an explicit synthetic track. */
    provenance: z.enum(['imported', 'simulation']),
    mode: z.enum(['flight', 'bounce']),
    hypothesis: z.string().min(1).max(1000),
    hypothesisAt: z.string().datetime(),
    conclusion: z.string().max(3000),
    video: z
      .object({
        name: z.string().max(300),
        sizeBytes: z.number().int().nonnegative(),
        mimeType: z.string().max(100),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        durationS: finite.nonnegative(),
        codec: z.string().max(20).nullable(),
        frameCount: z.number().int().nonnegative(),
        timebase: z.enum(['container', 'unknown']),
        timebaseIssues: z.array(z.string().max(40)).max(10),
        medianFrameIntervalS: finite.positive().nullable(),
        frameIntervalSpread: finite.nonnegative().nullable(),
      })
      .nullable(),
    speed: z.enum(['realtime', 'slowmo', 'unknown']),
    timeFactor: finite.positive().nullable(),
    scale: z
      .object({ p1: px, p2: px, lengthM: finite.positive(), lengthErrorM: finite.nonnegative() })
      .nullable(),
    clickErrorPx: finite.positive().max(50),
    points: z.array(trackPointSchema).max(3000),
    contactFrame: z.number().int().nonnegative().nullable(),
    autoRuns: z.array(autoRunSchema).max(50).default([]),
    flight: flightAnalysisSchema,
    bounce: bounceAnalysisSchema.nullable(),
  })
  .refine((d) => (d.provenance === 'imported') === (d.video !== null), {
    message: 'Imported records describe their video; synthetic ones have none',
  });
export type VideoInvestigation = z.infer<typeof videoInvestigationSchema>;
