import type { SubmissionInput } from '../../../../packages/contracts/classroom';
/**
 * Capability tokens and the unsent outbox live only on this device. A teacher who loses this
 * storage can still open the shared screen link, but cannot control the room.
 */
export type TeacherRoomRef = {
  code: string;
  title: string;
  ownerToken: string;
  viewerToken: string;
  createdAt: string;
};
export type StudentRoomRef = { code: string; token: string; pseudonym: string };
export type Outgoing = {
  body: SubmissionInput;
  status: 'queued' | 'sent' | 'rejected';
  error?: string;
};
const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const TEACHER = 'pocketlab.class.teacher';
const STUDENT = 'pocketlab.class.student';
export const teacherRooms = () => read<TeacherRoomRef[]>(TEACHER, []);
export const saveTeacherRoom = (room: TeacherRoomRef) =>
  write(TEACHER, [room, ...teacherRooms().filter((r) => r.code !== room.code)].slice(0, 20));
export const forgetTeacherRoom = (code: string) =>
  write(
    TEACHER,
    teacherRooms().filter((r) => r.code !== code),
  );
export const studentRoom = () => read<StudentRoomRef | null>(STUDENT, null);
export const saveStudentRoom = (room: StudentRoomRef | null) => write(STUDENT, room);
export const outbox = (code: string) => read<Outgoing[]>(`${STUDENT}.outbox.${code}`, []);
export const saveOutbox = (code: string, items: Outgoing[]) =>
  write(`${STUDENT}.outbox.${code}`, items.slice(-50));
