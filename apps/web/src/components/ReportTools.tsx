import { useEffect } from 'react';
import { Printer } from 'lucide-react';
import type { NotebookRecord } from '../../../../packages/contracts';

/** Prints the saved notebook view; never changes the record or creates a revision. */
export function ReportTools({ record }: { record: NotebookRecord }) {
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const prepare = () => {
      if (closed.length) return;
      closed = Array.from(
        document.querySelectorAll<HTMLDetailsElement>('main details:not([open])'),
      );
      closed.forEach((element) => {
        element.open = true;
      });
    };
    const restore = () => {
      closed.forEach((element) => {
        element.open = false;
      });
      closed = [];
    };
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', restore);
    return () => {
      restore();
      window.removeEventListener('beforeprint', prepare);
      window.removeEventListener('afterprint', restore);
    };
  }, [record.id]);
  return (
    <>
      <div className="report-tools">
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={16} /> Печать / PDF
        </button>
        <p className="subtle">
          В окне печати выбери «Сохранить как PDF», если браузер поддерживает эту возможность. Отчёт
          формируется на устройстве.
        </p>
      </div>
      <div className="report-heading">
        <strong>POCKETLAB · ОТЧЁТ ОБ ИССЛЕДОВАНИИ</strong>
        <p>
          Запись {record.id} · схема {record.schemaVersion}
          {'revision' in record ? ` · версия ${record.revision}` : ''}
        </p>
        <p>
          Источник:{' '}
          {
            {
              live: 'датчики / микрофон',
              manual: 'ручные измерения',
              imported: 'импортированные данные',
              simulation: 'СИМУЛЯЦИЯ — учебные данные, не физический опыт',
            }[record.provenance]
          }
        </p>
        <p>
          Графики отражают выбранное представление сохранённой записи. Полные исходные данные и
          версии анализа доступны в экспорте JSON.
        </p>
      </div>
    </>
  );
}
