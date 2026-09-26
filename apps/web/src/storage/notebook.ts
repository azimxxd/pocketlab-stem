import { openDB, type IDBPDatabase } from 'idb';
import { notebookRecordSchema, type NotebookRecord } from '../../../../packages/contracts';
import { saveFile } from '../platform/save-file';
let connection: Promise<IDBPDatabase> | undefined;
const db = () =>
  (connection ??= openDB('pocketlab', 1, {
    upgrade(db) {
      db.createObjectStore('investigations', { keyPath: 'id' });
    },
  }).catch((e) => {
    connection = undefined;
    throw e;
  }));
/** Rows that fail validation are reported, never silently hidden or deleted. */
export async function listInvestigations(): Promise<{
  records: NotebookRecord[];
  unreadable: unknown[];
}> {
  const records: NotebookRecord[] = [];
  const unreadable: unknown[] = [];
  for (const row of await (await db()).getAll('investigations')) {
    const p = notebookRecordSchema.safeParse(row);
    if (p.success) records.push(p.data);
    else unreadable.push(row);
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { records, unreadable };
}
/** Asks the browser not to evict the notebook (Safari may otherwise clear idle site data). */
async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch {}
}
export async function storagePersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}
export async function saveInvestigation(item: NotebookRecord) {
  await (await db()).put('investigations', notebookRecordSchema.parse(item));
  void requestPersistence();
}
export async function deleteInvestigation(id: string) {
  await (await db()).delete('investigations', id);
}
export function downloadUnreadable(rows: unknown[]) {
  saveFile('pocketlab-unreadable.json', JSON.stringify(rows, null, 2), 'application/json');
}
export function download(item: NotebookRecord, format: 'json' | 'csv') {
  const text =
    format === 'json'
      ? JSON.stringify(item, null, 2)
      : item.scenarioId === 'pendulum-01'
        ? [
            '# provenance=' + item.provenance,
            'length_m,cycles,elapsed_s,length_bound_m,time_bound_s,included',
            ...item.trials.map((t) =>
              [
                t.input.lengthM,
                t.input.cycles,
                t.input.elapsedS,
                t.input.lengthErrorM,
                t.input.timingErrorS,
                item.selectionEvents.filter((e) => e.trialId === t.id).at(-1)?.included ?? true,
              ].join(','),
            ),
          ].join('\n')
        : [
            '# provenance=' + item.provenance,
            't_s,dominant_frequency_hz,rms_dbfs',
            ...item.frames.map((f) => [f.t, f.peakHz ?? '', f.rmsDb ?? ''].join(',')),
          ].join('\n');
  saveFile(
    `pocketlab-${item.id.slice(0, 8)}.${format}`,
    text,
    format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
  );
}
