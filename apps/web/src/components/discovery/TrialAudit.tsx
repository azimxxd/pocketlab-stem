import { useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type { SelectionEvent } from '../../../../../packages/contracts';
import { trialSelection } from '../../../../../packages/physics/pendulum';
export type Column<T> = { header: string; cell: (trial: T) => ReactNode };
/**
 * Trial table with the exclusion audit: every exclusion needs a reason, raw trials stay visible and
 * can be restored, and the selection history is shown.
 */
export function TrialAudit<T extends { id: string }>({
  trials,
  events,
  inAnalysis,
  columns,
  placeholder,
  onSelect,
}: {
  trials: T[];
  events: SelectionEvent[];
  inAnalysis: number;
  columns: Column<T>[];
  placeholder: string;
  onSelect?: (trialId: string, included: boolean, reason: string) => void;
}) {
  const [excluding, setExcluding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const rows = trialSelection(trials, events);
  return (
    <>
      <div className="section-heading trial-heading">
        <h2>Попытки и условия</h2>
        <span>
          {trials.length} записей · {inAnalysis} в анализе
        </span>
      </div>
      <div className="table-scroll">
        <table className="trial-table">
          <thead>
            <tr>
              <th>№</th>
              {columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
              <th>Анализ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ trial, included, event }, i) => (
              <tr key={trial.id} className={!included ? 'excluded' : ''}>
                <td>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.header}>{c.cell(trial)}</td>
                ))}
                <td>
                  {onSelect ? (
                    <button
                      className="text-button"
                      onClick={() => {
                        if (included) {
                          setExcluding(trial.id);
                          setReason('');
                        } else onSelect(trial.id, true, 'Возвращено пользователем в анализ');
                      }}
                    >
                      {included ? (
                        'Исключить'
                      ) : (
                        <>
                          <RotateCcw size={14} />
                          Вернуть
                        </>
                      )}
                    </button>
                  ) : (
                    <span>{included ? 'Включена' : 'Исключена'}</span>
                  )}
                  {!included && <small>{event?.reason}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {excluding && onSelect && (
        <form
          className="exclude-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) {
              onSelect(excluding, false, reason.trim());
              setExcluding(null);
            }
          }}
        >
          <label htmlFor="exclusion-reason">
            Почему исключаем попытку {trials.findIndex((t) => t.id === excluding) + 1}?
          </label>
          <input
            id="exclusion-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            required
          />
          <button className="secondary" disabled={!reason.trim()}>
            Подтвердить исключение
          </button>
          <button className="text-button" type="button" onClick={() => setExcluding(null)}>
            Отмена
          </button>
        </form>
      )}
      {events.length > 0 && (
        <details className="method-details">
          <summary>История изменения выборки ({events.length})</summary>
          <ul>
            {events.map((e) => (
              <li key={e.id}>
                Попытка {trials.findIndex((t) => t.id === e.trialId) + 1}:{' '}
                {e.included ? 'возвращена' : 'исключена'} — {e.reason}.
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
