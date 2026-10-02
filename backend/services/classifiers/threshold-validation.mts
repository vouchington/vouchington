import type { ClassifierThresholds } from '@voucha/types'

/** Stored thresholds are NUMERIC(5,4): four decimal places between zero and one. */
const THRESHOLD_SCALE = 10_000

/** A candidate override: `null` leaves that bound inheriting the prompt version default. */
export type ClassifierThresholdOverride = { lower: number | null; upper: number | null }

export type ClassifierThresholdOverrideValidation =
  | { valid: true; effective: ClassifierThresholds }
  | { valid: false; reason: string }

/**
 * Validates an override against the active prompt version's defaults. It mirrors the database
 * constraints (each bound a probability, lower strictly below upper after inheriting defaults) and
 * additionally rejects values the NUMERIC(5,4) column would silently round.
 */
export function validateClassifierThresholdOverride(
  override: ClassifierThresholdOverride,
  defaults: ClassifierThresholds,
): ClassifierThresholdOverrideValidation {
  for (const [name, value] of [
    ['lower_threshold', override.lower],
    ['upper_threshold', override.upper],
  ] as const) {
    if (value !== null && !isStoredThreshold(value)) {
      return {
        valid: false,
        reason: `${name} must be null or a number from 0 to 1 with at most 4 decimal places`,
      }
    }
  }
  const effective = {
    lower: override.lower ?? defaults.lower,
    upper: override.upper ?? defaults.upper,
  }
  if (effective.lower >= effective.upper) {
    return {
      valid: false,
      reason: 'lower_threshold must be strictly below upper_threshold once defaults are applied',
    }
  }
  return { valid: true, effective }
}

function isStoredThreshold(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return false
  return Math.abs(value * THRESHOLD_SCALE - Math.round(value * THRESHOLD_SCALE)) < 1e-6
}

/** True when both bounds match, so a change request can be skipped without writing a revision. */
export function isSameClassifierThresholdOverride(
  left: ClassifierThresholdOverride,
  right: ClassifierThresholdOverride,
): boolean {
  return left.lower === right.lower && left.upper === right.upper
}
