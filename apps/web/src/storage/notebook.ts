import { openDB } from 'idb';
import { notebookRecordSchema, type NotebookRecord } from '../../../../packages/contracts';
const db = () =>
  openDB('pocketlab', 1, {
    upgrade(db) {
      db.createObjectStore('investigations', { keyPath: 'id' });
    },
  });
export async function listInvestigations(): Promise<NotebookRecord[]> {
  const data = await (await db()).getAll('investigations');
  return data
    .flatMap((row) => {
      const p = notebookRecordSchema.safeParse(row);
      return p.success ? [p.data] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveInvestigation(item: NotebookRecord) {
  await (await db()).put('investigations', notebookRecordSchema.parse(item));
}
export async function deleteInvestigation(id: string) {
  await (await db()).delete('investigations', id);
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
  const url = URL.createObjectURL(
    new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `pocketlab-${item.id.slice(0, 8)}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
