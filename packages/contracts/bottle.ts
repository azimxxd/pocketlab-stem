import { z } from 'zod';
import { selectionEventSchema } from './pendulum';
const finite = z.number().finite();
/** Volumes in m³ (SI); the UI converts from millilitres at the boundary. */
export const bottleInputSchema = z
  .object({
    capacityM3: finite.min(5e-5).max(0.01),
    waterM3: finite.min(0).max(0.01),
    volumeErrorM3: finite.positive().max(0.001),
  })
  .refine((v) => v.capacityM3 - v.waterM3 > v.volumeErrorM3, {
    message: 'Объём воздуха должен быть больше погрешности объёма.',
  });
export type BottleInput = z.infer<typeof bottleInputSchema>;
const liveToneSchema = z.object({
  kind: z.literal('live'),
  algorithmVersion: z.literal('steady-tone-v1'),
  frequencyHz: finite.min(20).max(4000),
  spreadHz: finite.nonnegative(),
  voicedFrames: z.number().int().nonnegative(),
  stableFrames: z.number().int().positive(),
  totalFrames: z.number().int().positive(),
  sampleRate: finite.positive(),
  fftSize: z.number().int().positive(),
  /** Per-frame dominant component, kept for review; raw audio is never stored. */
  peaks: z.array(z.object({ t: finite.nonnegative(), hz: finite.positive().nullable() })).max(400),
  audioSettings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
const enteredToneSchema = z.object({
  kind: z.enum(['manual', 'simulation']),
  frequencyHz: finite.min(20).max(4000),
  frequencyErrorHz: finite.positive().max(500),
});
export const bottleToneSchema = z.discriminatedUnion('kind', [liveToneSchema, enteredToneSchema]);
export type BottleTone = z.infer<typeof bottleToneSchema>;
export const bottleTrialSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    provenance: z.enum(['live', 'manual', 'simulation']),
    input: bottleInputSchema,
    tone: bottleToneSchema,
  })
  .refine((t) => t.provenance === t.tone.kind, { message: 'Tone source must match provenance' });
export type BottleTrial = z.infer<typeof bottleTrialSchema>;
export const bottleModelIdSchema = z.enum(['constant', 'linear', 'inverse-sqrt']);
export type BottleModelId = z.infer<typeof bottleModelIdSchema>;
export const bottleComparisonSchema = z.object({
  algorithmVersion: z.literal('bottle-v1'),
  inputTrialIds: z.array(z.string().uuid()),
  distinctVolumes: z.number().int().nonnegative(),
  volumeRatio: finite.nonnegative(),
  fits: z.array(
    z.object({
      model: bottleModelIdSchema,
      a: finite,
      b: finite,
      rmse: finite.nonnegative(),
      cvRmse: finite.nonnegative().nullable(),
      residuals: z.array(z.object({ trialId: z.string(), value: finite })),
    }),
  ),
  bestModel: bottleModelIdSchema.nullable(),
  status: z.enum(['insufficient', 'narrow-range', 'ambiguous', 'compared']),
  /** f² = k·(1/V) + b; k in Hz²·m³, b in Hz². */
  inverseFit: z.object({ slope: finite, intercept: finite }).nullable(),
});
export type BottleComparison = z.infer<typeof bottleComparisonSchema>;
export const bottleInvestigationSchema = z
  .object({
    schemaVersion: z.literal(2),
    scenarioId: z.literal('bottle-01'),
    scenarioVersion: z.literal(1),
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    revision: z.number().int().positive(),
    provenance: z.enum(['live', 'manual', 'simulation']),
    hypothesis: z.string().min(1).max(1000),
    hypothesisAt: z.string().datetime(),
    conclusion: z.string().max(3000),
    trials: z.array(bottleTrialSchema).min(1).max(150),
    selectionEvents: z.array(selectionEventSchema).max(1000),
    analyses: z
      .array(
        z.object({
          id: z.string().uuid(),
          at: z.string().datetime(),
          revision: z.number().int().positive(),
          conclusion: z.string().max(3000),
          selectionEventIds: z.array(z.string().uuid()),
          result: bottleComparisonSchema,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set(doc.trials.map((t) => t.id));
    if (ids.size !== doc.trials.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate trial IDs' });
    if (doc.trials.some((t) => t.provenance !== doc.provenance))
      ctx.addIssue({ code: 'custom', message: 'Mixed source data' });
    if (doc.selectionEvents.some((e) => !ids.has(e.trialId)))
      ctx.addIssue({ code: 'custom', message: 'Unknown selected trial' });
    const events = new Set(doc.selectionEvents.map((e) => e.id));
    if (
      doc.analyses.some(
        (a) =>
          a.revision > doc.revision ||
          a.result.inputTrialIds.some((id) => !ids.has(id)) ||
          a.selectionEventIds.some((id) => !events.has(id)),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid analysis reference' });
  });
export type BottleInvestigation = z.infer<typeof bottleInvestigationSchema>;
