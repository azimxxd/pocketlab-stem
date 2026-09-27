import { z } from "zod";

export const soundFrameSchema = z.object({
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().finite().nonnegative(),
  sampleRate: z.number().finite().min(8000).max(384000),
  maxFrequency: z.number().finite().positive().max(20000),
  waveform: z.array(z.number().finite().min(-1).max(1)).length(256),
  spectrum: z.array(z.number().finite().min(-120).max(0)).length(128),
  pitch: z.number().finite().min(60).max(1600).nullable(),
  level: z.number().finite().min(-120).max(0),
});
export type SoundFrame = z.infer<typeof soundFrameSchema>;
