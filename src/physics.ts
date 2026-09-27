export const REFERENCE_GRAVITY_MS2 = 9.81;
export const PHYSICS_ALGORITHM_VERSION = "simple-pendulum-gravity-1.0.0";

export type GravityInput = {
  lengthMeters: number;
  periodSeconds: number;
  lengthUncertaintyMeters?: number;
  periodUncertaintySeconds?: number;
};

export type GravityEstimate =
  | {
      valid: true;
      gravityMs2: number;
      uncertaintyMs2?: number;
      referenceGravityMs2: number;
      differenceMs2: number;
      relativeDifferencePercent: number;
    }
  | { valid: false; reason: string };

export function estimateGravity(input: GravityInput): GravityEstimate {
  const { lengthMeters: length, periodSeconds: period } = input;
  if (!Number.isFinite(length) || length <= 0)
    return { valid: false, reason: "Длина должна быть больше нуля." };
  if (!Number.isFinite(period) || period <= 0)
    return { valid: false, reason: "Период должен быть больше нуля." };
  const lengthSigma = input.lengthUncertaintyMeters,
    periodSigma = input.periodUncertaintySeconds;
  if (
    (lengthSigma !== undefined &&
      (!Number.isFinite(lengthSigma) || lengthSigma < 0)) ||
    (periodSigma !== undefined &&
      (!Number.isFinite(periodSigma) || periodSigma < 0))
  )
    return {
      valid: false,
      reason: "Неопределённость должна быть неотрицательной.",
    };

  const gravity = (4 * Math.PI ** 2 * length) / period ** 2,
    uncertainty =
      lengthSigma !== undefined && periodSigma !== undefined
        ? gravity *
          Math.sqrt(
            (lengthSigma / length) ** 2 + ((2 * periodSigma) / period) ** 2,
          )
        : undefined,
    difference = gravity - REFERENCE_GRAVITY_MS2;
  if (
    !Number.isFinite(gravity) ||
    (uncertainty !== undefined && !Number.isFinite(uncertainty))
  )
    return {
      valid: false,
      reason: "Не удалось вычислить результат для этих значений.",
    };
  return {
    valid: true,
    gravityMs2: gravity,
    ...(uncertainty === undefined ? {} : { uncertaintyMs2: uncertainty }),
    referenceGravityMs2: REFERENCE_GRAVITY_MS2,
    differenceMs2: difference,
    relativeDifferencePercent:
      (Math.abs(difference) / REFERENCE_GRAVITY_MS2) * 100,
  };
}

export function parsePendulumLengthCm(
  raw: string,
): { valid: true; lengthMeters: number } | { valid: false; reason: string } {
  const value = Number(raw.trim().replace(",", "."));
  if (!raw.trim() || !Number.isFinite(value))
    return { valid: false, reason: "Укажите длину маятника в сантиметрах." };
  if (value < 1)
    return { valid: false, reason: "Длина должна быть не меньше 1 см." };
  return { valid: true, lengthMeters: value / 100 };
}

export function parseLengthUncertaintyCm(
  raw: string,
):
  | { valid: true; uncertaintyMeters?: number }
  | { valid: false; reason: string } {
  if (!raw.trim()) return { valid: true };
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0)
    return {
      valid: false,
      reason: "Погрешность длины должна быть неотрицательной.",
    };
  return { valid: true, uncertaintyMeters: value / 100 };
}
