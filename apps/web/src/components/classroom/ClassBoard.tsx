import type { BoardSubmission } from '../../../../../packages/contracts/classroom';
import type { PendulumTrial } from '../../../../../packages/contracts';
import { PendulumResults } from '../PendulumResults';
/**
 * Class results as a pendulum series: every visible submission is one trial. The same model
 * comparison as the individual lab runs on the combined data.
 */
export function ClassBoard({ submissions }: { submissions: BoardSubmission[] }) {
  const trials: PendulumTrial[] = submissions
    .filter((s) => !s.hidden)
    .map((s) => ({
      id: s.id,
      createdAt: s.receivedAt,
      provenance: 'manual',
      acquisitionKind: s.acquisitionKind,
      input: s.input,
    }));
  if (!trials.length)
    return (
      <div className="series-empty">
        <div>
          <h2>Пока нет результатов</h2>
          <p>Точки появятся здесь, как только участники отправят свои измерения.</p>
        </div>
      </div>
    );
  return <PendulumResults trials={trials} events={[]} />;
}
