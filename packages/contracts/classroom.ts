import { z } from 'zod';
import { pendulumInputSchema } from './pendulum';
/** Room code: discovery only, never a control credential. No 0/O/1/I/L/U to avoid misreading. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const roomCodeSchema = z
  .string()
  .regex(new RegExp(`^[${CODE_ALPHABET}]{6}$`), 'Код комнаты — 6 символов');
export const CLASS_LIMITS = {
  participants: 30,
  submissionsPerParticipant: 20,
  submissionsTotal: 600,
  /** Joining and submitting are possible for this long after creation. */
  activeMs: 2 * 60 * 60 * 1000,
  /** Everything is deleted this long after creation unless the teacher deletes it earlier. */
  retentionMs: 7 * 24 * 60 * 60 * 1000,
  submitsPerMinute: 20,
  joinsPerMinute: 60,
};
export const roomStateSchema = z.enum(['lobby', 'collecting', 'discussing', 'closed']);
export type RoomState = z.infer<typeof roomStateSchema>;
export const roleSchema = z.enum(['owner', 'participant', 'viewer']);
export type Role = z.infer<typeof roleSchema>;
const pseudonym = z
  .string()
  .trim()
  .min(1, 'Введи псевдоним')
  .max(24, 'Псевдоним до 24 символов')
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Только буквы, цифры, пробел, точка, дефис');
export const createRoomSchema = z.object({
  scenarioId: z.literal('pendulum-01'),
  title: z.string().trim().max(80).default(''),
});
export const joinSchema = z.object({ pseudonym });
/** A student's pendulum trial. Values are validated with the same schema as the local lab. */
export const submissionInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  scenarioId: z.literal('pendulum-01'),
  input: pendulumInputSchema,
  /** Only manual measurements reach the class board; simulations stay in the student's notebook. */
  provenance: z.literal('manual'),
  acquisitionKind: z.enum(['timer', 'entered']),
});
export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export const conditionSchema = z.object({ lengthM: z.number().finite().min(0.05).max(5) });
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setState'), state: roomStateSchema }),
  z.object({ type: z.literal('lockJoin'), locked: z.boolean() }),
  z.object({
    type: z.literal('assign'),
    participantId: z.string().uuid(),
    condition: conditionSchema.nullable(),
  }),
  z.object({ type: z.literal('setHidden'), submissionId: z.string().uuid(), hidden: z.boolean() }),
  z.object({ type: z.literal('removeParticipant'), participantId: z.string().uuid() }),
]);
export type Command = z.infer<typeof commandSchema>;
export const boardSubmissionSchema = z.object({
  id: z.string().uuid(),
  participantId: z.string().uuid(),
  pseudonym: z.string(),
  receivedAt: z.string().datetime(),
  input: pendulumInputSchema,
  acquisitionKind: z.enum(['timer', 'entered']),
  hidden: z.boolean(),
});
export type BoardSubmission = z.infer<typeof boardSubmissionSchema>;
export const snapshotSchema = z.object({
  code: roomCodeSchema,
  scenarioId: z.literal('pendulum-01'),
  title: z.string(),
  state: roomStateSchema,
  joinLocked: z.boolean(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  activeUntil: z.string().datetime(),
  deleteAt: z.string().datetime(),
  role: roleSchema,
  participantCount: z.number().int().nonnegative(),
  /** Owner only: everyone in the room with their assigned condition. */
  participants: z
    .array(
      z.object({
        id: z.string().uuid(),
        pseudonym: z.string(),
        joinedAt: z.string().datetime(),
        condition: conditionSchema.nullable(),
        submissions: z.number().int().nonnegative(),
      }),
    )
    .nullable(),
  /** Participant only. */
  me: z
    .object({ id: z.string().uuid(), pseudonym: z.string(), condition: conditionSchema.nullable() })
    .nullable(),
  /** Owner sees hidden submissions (flagged); everyone else only visible ones. */
  submissions: z.array(boardSubmissionSchema),
});
export type RoomSnapshot = z.infer<typeof snapshotSchema>;
export const createdRoomSchema = z.object({
  code: roomCodeSchema,
  ownerToken: z.string().min(40),
  viewerToken: z.string().min(40),
  snapshot: snapshotSchema,
});
export const joinedSchema = z.object({
  participantToken: z.string().min(40),
  snapshot: snapshotSchema,
});
