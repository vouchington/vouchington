import type { DynamicConfig } from './dynamic-config.mts'

export type BoundedPositiveIntegerLimits = {
  /** Returned when the stored value is unusable. Must be a positive integer no greater than `maxValue`. */
  defaultValue: number
  /** Hard ceiling. A stored value above it is treated as invalid, never clamped to it. */
  maxValue: number
}

/**
 * Reads a positive-integer tunable from a `DynamicConfig`. A value that is missing, not a number,
 * not an integer, zero, negative, or above `maxValue` yields `defaultValue`, so a bad stored value
 * (for example a typo with extra zeros) can never widen a bound past its hard maximum.
 */
export function getBoundedPositiveIntegerField(
  config: Pick<DynamicConfig, 'fields'>,
  field: string,
  { defaultValue, maxValue }: BoundedPositiveIntegerLimits,
): number {
  const value = config.fields.get(field)
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maxValue
    ? value
    : defaultValue
}
