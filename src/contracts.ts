import { soundFrameSchema } from "./sound/contracts";
import { z } from "zod";
export type ExperimentType = "pendulum" | "sound" | "bottle";
export const SENSOR_STALL_TIMEOUT_MS = 10_000;
const value = z.number().finite().nullable();
export const xyz = z.object({ x: value, y: value, z: value });
export const angles = z.object({ alpha: value, beta: value, gamma: value });
export const sampleSchema = z.object({
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().finite().nonnegative(),
  source: z.enum(["motion", "orientation"]),
  acceleration: xyz,
  accelerationIncludingGravity: xyz,
  rotationRate: angles,
  orientation: angles.extend({ absolute: z.boolean().optional() }),
  orientationTimestamp: z.number().finite().nonnegative().nullable(),
  screenAngle: value,
});
export type SensorSample = z.infer<typeof sampleSchema>;
export type State =
  | "DISCONNECTED"
  | "CONNECTED"
  | "CALIBRATING"
  | "READY"
  | "WAITING_FOR_MOTION"
  | "MEASURING"
  | "STOPPED"
  | "ERROR";
export const groups = [
  "acceleration",
  "accelerationIncludingGravity",
  "rotationRate",
  "orientation",
] as const;
export const axes = {
  acceleration: ["x", "y", "z"],
  accelerationIncludingGravity: ["x", "y", "z"],
  rotationRate: ["alpha", "beta", "gamma"],
  orientation: ["alpha", "beta", "gamma"],
} as const;
export const nullXYZ = () => ({ x: null, y: null, z: null });
export const nullAngles = () => ({ alpha: null, beta: null, gamma: null });
export const finite = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;
export const clientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), token: z.string().min(16).max(100), experiment: z.enum(["pendulum", "sound", "bottle"]).default("pendulum") }),
  z.object({
    type: z.literal("resume"),
    code: z.string().length(6),
    token: z.string().min(16).max(100),
    experiment: z.enum(["pendulum", "sound", "bottle"]).optional(),
  }),
  z.object({
    type: z.literal("join"),
    code: z.string().length(6),
    token: z.string().min(16).max(100),
    userAgent: z.string().max(1000),
  }),
  z.object({ type: z.literal("sample"), sample: sampleSchema }),
  z.object({ type: z.literal("sound-frame"), frame: soundFrameSchema }),
  z.object({ type: z.literal("sound-ready"), ready: z.boolean() }),
  z.object({ type: z.literal("capabilities"), motion: z.boolean(), microphone: z.boolean() }),
  z.object({ type: z.literal("status"), message: z.string().max(1000) }),
  z.object({ type: z.literal("interruption"), reason: z.string().max(1000) }),
  z.object({
    type: z.literal("state"),
    state: z.enum([
      "DISCONNECTED",
      "CONNECTED",
      "CALIBRATING",
      "READY",
      "WAITING_FOR_MOTION",
      "MEASURING",
      "STOPPED",
      "ERROR",
    ]),
    message: z.string().max(1000),
  }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("ping"), sent: z.number().finite() }),
]);
