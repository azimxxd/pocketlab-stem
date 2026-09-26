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
const IMPORT_LIMIT_BYTES = 5 * 1024 * 1024;
/**
 * Imports a JSON file exported by PocketLab: one record or an array. Every record is validated
 * against the current schemas; invalid ones are skipped and counted. An identical record is not
 * duplicated; a different record with an existing ID is kept as a copy, never overwriting.
 */
export async function importRecords(file: Blob) {
  if (file.size > IMPORT_LIMIT_BYTES)
    throw new Error('Файл больше 5 МБ — это не похоже на экспорт PocketLab.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }
  const rows = Array.isArray(data) ? data : [data];
  const parsed = rows.map((row) => notebookRecordSchema.safeParse(row));
  const valid = parsed.flatMap((p) => (p.success ? [p.data] : []));
  if (!valid.length)
    throw new Error(
      'В файле нет исследований, которые эта версия PocketLab умеет прочитать. Дневник не изменён.',
    );
  const store = await db();
  const result = { imported: 0, duplicates: 0, copies: 0, invalid: rows.length - valid.length };
  for (const record of valid) {
    const existing = await store.get('investigations', record.id);
    if (existing === undefined) {
      await store.put('investigations', record);
      result.imported++;
    } else if (JSON.stringify(existing) === JSON.stringify(record)) result.duplicates++;
    else {
      await store.put('investigations', { ...record, id: crypto.randomUUID() });
      result.imported++;
      result.copies++;
    }
  }
  void requestPersistence();
  return result;
}
export async function deleteInvestigation(id: string) {
  await (await db()).delete('investigations', id);
}
export function downloadUnreadable(rows: unknown[]) {
  saveFile('pocketlab-unreadable.json', JSON.stringify(rows, null, 2), 'application/json');
}
const lastIncluded = (
  item: { selectionEvents: { trialId: string; included: boolean }[] },
  id: string,
) => item.selectionEvents.filter((e) => e.trialId === id).at(-1)?.included ?? true;
function csv(item: NotebookRecord) {
  switch (item.scenarioId) {
    case 'pendulum-01':
      return [
        '# provenance=' + item.provenance,
        'length_m,cycles,elapsed_s,length_bound_m,time_bound_s,included',
        ...item.trials.map((t) =>
          [
            t.input.lengthM,
            t.input.cycles,
            t.input.elapsedS,
            t.input.lengthErrorM,
            t.input.timingErrorS,
            lastIncluded(item, t.id),
          ].join(','),
        ),
      ];
    case 'bottle-01':
      return [
        '# provenance=' + item.provenance,
        '# frequency_error_hz is the tone spread (half IQR) for microphone trials and an entered bound otherwise',
        'capacity_m3,water_m3,air_m3,volume_bound_m3,frequency_hz,frequency_error_hz,source,included',
        ...item.trials.map((t) =>
          [
            t.input.capacityM3,
            t.input.waterM3,
            t.input.capacityM3 - t.input.waterM3,
            t.input.volumeErrorM3,
            t.tone.frequencyHz,
            t.tone.kind === 'live' ? t.tone.spreadHz : t.tone.frequencyErrorHz,
            t.tone.kind,
            lastIncluded(item, t.id),
          ].join(','),
        ),
      ];
    case 'motion-01':
      return [
        '# provenance=' + item.provenance,
        '# empty cell = value not reported by the sensor; rotation in deg/s about device axes',
        't_s,ax_m_s2,ay_m_s2,az_m_s2,wx_deg_s,wy_deg_s,wz_deg_s',
        ...item.samples.map((s) =>
          [
            s.t,
            s.accelerationWithGravity?.x ?? '',
            s.accelerationWithGravity?.y ?? '',
            s.accelerationWithGravity?.z ?? '',
            s.rotationRate?.beta ?? '',
            s.rotationRate?.gamma ?? '',
            s.rotationRate?.alpha ?? '',
          ].join(','),
        ),
      ];
    default:
      return [
        '# provenance=' + item.provenance,
        't_s,dominant_frequency_hz,rms_dbfs',
        ...item.frames.map((f) => [f.t, f.peakHz ?? '', f.rmsDb ?? ''].join(',')),
      ];
  }
}
export function download(item: NotebookRecord, format: 'json' | 'csv') {
  saveFile(
    `pocketlab-${item.id.slice(0, 8)}.${format}`,
    format === 'json' ? JSON.stringify(item, null, 2) : csv(item).join('\n'),
    format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
  );
}
