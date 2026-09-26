import { z } from 'zod';
export const provenanceSchema = z.enum(['live', 'manual', 'imported', 'simulation']);
export type Provenance = z.infer<typeof provenanceSchema>;
const finite = z.number().finite();
export const spectrumFrameSchema = z.object({
  t: finite.nonnegative(),
  peakHz: finite.positive().nullable(),
  rmsDb: finite.nullable(),
  peakProminenceDb: finite.nullable(),
  bins: z.array(finite).max(256),
});
export type SpectrumFrame = z.infer<typeof spectrumFrameSchema>;
export const qualitySchema = z.object({
  status: z.enum(['valid', 'warning', 'invalid']),
  reasons: z.array(z.enum(['TOO_SHORT', 'NO_STABLE_TONE', 'INTERRUPTED', 'CLIPPING', 'DEMO_DATA'])),
});
export type Quality = z.infer<typeof qualitySchema>;
export const analysisSchema = z.object({
  algorithmVersion: z.literal('sound-v0.1'),
  peakHz: finite.positive().nullable(),
  averageDb: finite.nullable(),
  duration: finite.nonnegative(),
  quality: qualitySchema,
});
export type SoundAnalysis = z.infer<typeof analysisSchema>;
export const investigationSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  scenarioId: z.literal('sound-01'),
  scenarioVersion: z.literal(1),
  provenance: provenanceSchema,
  hypothesis: z.string().min(1).max(1000),
  hypothesisAt: z.string().datetime(),
  conclusion: z.string().max(3000),
  sampleRate: finite.positive(),
  fftSize: z.number().int().positive(),
  frequencyMax: finite.positive(),
  frames: z.array(spectrumFrameSchema).min(1).max(1000),
  analysis: analysisSchema,
  audioSettings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type Investigation = z.infer<typeof investigationSchema>;
export type Vec3 = { x: number; y: number; z: number };
export type MotionSample = z.infer<typeof motionSampleSchema>;
export * from './pendulum';
export * from './bottle';
export * from './motion';
export * from './video';
import { pendulumInvestigationSchema } from './pendulum';
import { bottleInvestigationSchema } from './bottle';
import { motionInvestigationSchema, motionSampleSchema } from './motion';
import { videoInvestigationSchema } from './video';
// v1 audio records remain readable without a destructive storage migration.
export const notebookRecordSchema = z.union([
  investigationSchema,
  pendulumInvestigationSchema,
  bottleInvestigationSchema,
  motionInvestigationSchema,
  videoInvestigationSchema,
]);
export type NotebookRecord = z.infer<typeof notebookRecordSchema>;
