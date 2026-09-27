import type { PendulumExport } from "./pendulum";

export const EXPERIMENT_ALGORITHM_VERSION = "pendulum-length-fit-1.0.0";
export const MINIMUM_EXPERIMENT_LENGTHS = 4;

export type ExperimentTrial = {
  id: string;
  lengthMeters: number;
  lengthUncertaintyMeters: number | null;
  savedAt: string;
  periodSeconds: number;
  periodSpreadSeconds: number | null;
  frequencyHz: number;
  completePeriods: number;
  quality: string;
  individualGravityEstimateMs2: number | null;
  individualGravityUncertaintyMs2: number | null;
  referenceGravityMs2: number;
  relativeDifferencePercent: number | null;
  gravityAlgorithmVersion: string;
  excluded: boolean;
  exclusionReason: string | null;
  recording: Record<string, unknown>;
  pendulum: PendulumExport;
};

export type ExperimentCondition = {
  lengthMeters: number;
  periodSeconds: number;
  periodSquaredSeconds2: number;
  frequencyHz: number;
  periodSpreadSeconds: number | null;
  trialCount: number;
  completePeriods: number;
  trialIds: string[];
};

export type ExperimentAnalysis = {
  algorithmVersion: string;
  minimumDistinctLengths: number;
  distinctLengthCount: number;
  conditions: ExperimentCondition[];
  fit: null | {
    slopeSecondsSquaredPerMeter: number;
    interceptSecondsSquared: number;
    rSquared: number | null;
    rmseSecondsSquared: number;
    residuals: Array<{
      lengthMeters: number;
      observedPeriodSquaredSeconds2: number;
      fittedPeriodSquaredSeconds2: number;
      residualSeconds2: number;
    }>;
    gravityEstimateMs2: number | null;
  };
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function isValidTrial(
  trial: ExperimentTrial | null | undefined,
): trial is ExperimentTrial {
  return (
    !!trial &&
    !trial.excluded &&
    Number.isFinite(trial.lengthMeters) &&
    trial.lengthMeters > 0 &&
    Number.isFinite(trial.periodSeconds) &&
    trial.periodSeconds > 0 &&
    Number.isFinite(trial.frequencyHz) &&
    trial.frequencyHz > 0 &&
    Number.isFinite(trial.completePeriods) &&
    trial.completePeriods > 0
  );
}

export function analyzePendulumExperiment(
  trials: readonly (ExperimentTrial | null | undefined)[],
  minimumLengths = MINIMUM_EXPERIMENT_LENGTHS,
): ExperimentAnalysis {
  const byLength = new Map<number, ExperimentTrial[]>();
  for (const trial of trials) {
    if (!isValidTrial(trial)) continue;
    const condition = byLength.get(trial.lengthMeters) ?? [];
    condition.push(trial);
    byLength.set(trial.lengthMeters, condition);
  }
  const conditions: ExperimentCondition[] = [...byLength.entries()]
    .map(([lengthMeters, repeats]) => {
      const periodSeconds = median(
        repeats.map((trial) => trial.periodSeconds),
      )!;
      const mad = median(
        repeats.map((trial) => Math.abs(trial.periodSeconds - periodSeconds)),
      );
      return {
        lengthMeters,
        periodSeconds,
        periodSquaredSeconds2: periodSeconds ** 2,
        frequencyHz: 1 / periodSeconds,
        periodSpreadSeconds: mad === null ? null : 1.4826 * mad,
        trialCount: repeats.length,
        completePeriods: repeats.reduce(
          (sum, trial) => sum + trial.completePeriods,
          0,
        ),
        trialIds: repeats.map((trial) => trial.id),
      };
    })
    .sort((a, b) => a.lengthMeters - b.lengthMeters);

  if (conditions.length < minimumLengths)
    return {
      algorithmVersion: EXPERIMENT_ALGORITHM_VERSION,
      minimumDistinctLengths: minimumLengths,
      distinctLengthCount: conditions.length,
      conditions,
      fit: null,
    };

  const xs = conditions.map((condition) => condition.lengthMeters),
    ys = conditions.map((condition) => condition.periodSquaredSeconds2),
    xMean = xs.reduce((sum, x) => sum + x, 0) / xs.length,
    yMean = ys.reduce((sum, y) => sum + y, 0) / ys.length,
    xx = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  if (xx <= 0)
    return {
      algorithmVersion: EXPERIMENT_ALGORITHM_VERSION,
      minimumDistinctLengths: minimumLengths,
      distinctLengthCount: conditions.length,
      conditions,
      fit: null,
    };
  const slope =
      xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0) /
      xx,
    intercept = yMean - slope * xMean,
    residuals = conditions.map((condition) => {
      const fitted = slope * condition.lengthMeters + intercept;
      return {
        lengthMeters: condition.lengthMeters,
        observedPeriodSquaredSeconds2: condition.periodSquaredSeconds2,
        fittedPeriodSquaredSeconds2: fitted,
        residualSeconds2: condition.periodSquaredSeconds2 - fitted,
      };
    }),
    residualSumSquares = residuals.reduce(
      (sum, residual) => sum + residual.residualSeconds2 ** 2,
      0,
    ),
    totalSumSquares = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0),
    rSquared =
      totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : null;

  return {
    algorithmVersion: EXPERIMENT_ALGORITHM_VERSION,
    minimumDistinctLengths: minimumLengths,
    distinctLengthCount: conditions.length,
    conditions,
    fit: {
      slopeSecondsSquaredPerMeter: slope,
      interceptSecondsSquared: intercept,
      rSquared,
      rmseSecondsSquared: Math.sqrt(residualSumSquares / conditions.length),
      residuals,
      gravityEstimateMs2: slope > 0 ? (4 * Math.PI ** 2) / slope : null,
    },
  };
}

export function experimentCsv(trials: readonly ExperimentTrial[]): string {
  const analysis = analyzePendulumExperiment(trials, 1),
    medians = new Map(
      analysis.conditions.map((condition) => [
        condition.lengthMeters,
        condition.periodSeconds,
      ]),
    ),
    quote = (value: string) => `"${value.replaceAll('"', '""')}"`,
    rows = [
      "trial_id,length_m,length_uncertainty_m,period_s,period_squared_s2,period_spread_s,frequency_hz,complete_periods,included,exclusion_reason,condition_median_period_s",
      ...trials.map((trial) =>
        [
          quote(trial.id),
          trial.lengthMeters,
          trial.lengthUncertaintyMeters ?? "",
          trial.periodSeconds,
          trial.periodSeconds ** 2,
          trial.periodSpreadSeconds ?? "",
          trial.frequencyHz,
          trial.completePeriods,
          !trial.excluded,
          quote(trial.exclusionReason ?? ""),
          medians.get(trial.lengthMeters) ?? "",
        ].join(","),
      ),
    ];
  return `${rows.join("\n")}\n`;
}

export class PendulumExperiment {
  readonly algorithmVersion = EXPERIMENT_ALGORITHM_VERSION;
  readonly trials: ExperimentTrial[] = [];
  private nextId = 1;

  addTrial(
    trial: Omit<
      ExperimentTrial,
      "id" | "savedAt" | "excluded" | "exclusionReason"
    >,
  ): ExperimentTrial {
    if (
      !Number.isFinite(trial.lengthMeters) ||
      trial.lengthMeters <= 0 ||
      !Number.isFinite(trial.periodSeconds) ||
      trial.periodSeconds <= 0 ||
      !Number.isFinite(trial.frequencyHz) ||
      trial.frequencyHz <= 0 ||
      trial.completePeriods < 1
    )
      throw new Error(
        "Нельзя сохранить измерение без корректной длины и периода.",
      );
    const saved: ExperimentTrial = {
      ...trial,
      id: `trial-${this.nextId++}`,
      savedAt: new Date().toISOString(),
      excluded: false,
      exclusionReason: null,
    };
    this.trials.push(saved);
    return saved;
  }

  excludeTrial(id: string, reason = "Исключено пользователем"): boolean {
    const trial = this.trials.find((item) => item.id === id);
    if (!trial) return false;
    trial.excluded = true;
    trial.exclusionReason = reason;
    return true;
  }

  restoreTrial(id: string): boolean {
    const trial = this.trials.find((item) => item.id === id);
    if (!trial) return false;
    trial.excluded = false;
    trial.exclusionReason = null;
    return true;
  }

  analyze() {
    return analyzePendulumExperiment(this.trials);
  }

  export(currentTrial?: unknown) {
    return {
      version: 1,
      algorithmVersion: this.algorithmVersion,
      minimumDistinctLengths: MINIMUM_EXPERIMENT_LENGTHS,
      trials: this.trials,
      analysis: this.analyze(),
      ...(currentTrial === undefined ? {} : { currentTrial }),
    };
  }
}
