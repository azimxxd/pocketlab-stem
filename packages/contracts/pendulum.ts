import { z } from 'zod';
const finite = z.number().finite();
export const pendulumInputSchema = z
  .object({
    lengthM: finite.min(0.05).max(5),
    cycles: z.number().int().min(1).max(100),
    elapsedS: finite.min(0.1).max(600),
    lengthErrorM: finite.positive().max(0.2),
    timingErrorS: finite.positive().max(10),
  })
  .refine((v) => v.lengthErrorM < v.lengthM && v.timingErrorS < v.elapsedS, {
    message: 'Погрешность должна быть меньше измеренной величины.',
  });
export type PendulumInput = z.infer<typeof pendulumInputSchema>;
export const pendulumTrialSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  provenance: z.enum(['manual', 'simulation']),
  acquisitionKind: z.enum(['timer', 'entered', 'simulation']),
  input: pendulumInputSchema,
});
export type PendulumTrial = z.infer<typeof pendulumTrialSchema>;
export const selectionEventSchema = z.object({
  id: z.string().uuid(),
  trialId: z.string().uuid(),
  included: z.boolean(),
  reason: z.string().min(1).max(300),
  at: z.string().datetime(),
});
export type SelectionEvent = z.infer<typeof selectionEventSchema>;
export const modelIdSchema = z.enum(['constant', 'linear', 'sqrt']);
export type ModelId = z.infer<typeof modelIdSchema>;
export const modelFitSchema = z.object({
  model: modelIdSchema,
  a: finite,
  b: finite,
  rmse: finite.nonnegative(),
  cvRmse: finite.nonnegative().nullable(),
  residuals: z.array(z.object({ trialId: z.string(), value: finite })),
});
export type ModelFit = z.infer<typeof modelFitSchema>;
export const comparisonSchema = z.object({
  algorithmVersion: z.literal('pendulum-v1'),
  inputTrialIds: z.array(z.string().uuid()),
  distinctLengths: z.number().int().nonnegative(),
  lengthRatio: finite.nonnegative(),
  fits: z.array(modelFitSchema),
  bestModel: modelIdSchema.nullable(),
  status: z.enum(['insufficient', 'narrow-range', 'ambiguous', 'compared']),
  squaredFit: z
    .object({ slope: finite, intercept: finite, g: finite.positive().nullable() })
    .nullable(),
});
export type PendulumComparison = z.infer<typeof comparisonSchema>;
export const pendulumInvestigationSchema = z
  .object({
    schemaVersion: z.literal(2),
    scenarioId: z.literal('pendulum-01'),
    scenarioVersion: z.literal(1),
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    revision: z.number().int().positive(),
    provenance: z.enum(['manual', 'simulation']),
    hypothesis: z.string().min(1).max(1000),
    hypothesisAt: z.string().datetime(),
    conclusion: z.string().max(3000),
    trials: z.array(pendulumTrialSchema).min(1).max(150),
    selectionEvents: z.array(selectionEventSchema).max(1000),
    analyses: z
      .array(
        z.object({
          id: z.string().uuid(),
          at: z.string().datetime(),
          revision: z.number().int().positive(),
          conclusion: z.string().max(3000),
          selectionEventIds: z.array(z.string().uuid()),
          result: comparisonSchema,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set(doc.trials.map((t) => t.id));
    if (ids.size !== doc.trials.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate trial IDs' });
    if (
      doc.trials.some(
        (t) =>
          t.provenance !== doc.provenance ||
          (t.provenance === 'simulation') !== (t.acquisitionKind === 'simulation'),
      )
    )
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
export type PendulumInvestigation = z.infer<typeof pendulumInvestigationSchema>;
