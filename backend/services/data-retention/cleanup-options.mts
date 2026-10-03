import type { DataRetentionLimits } from './config.mts'
import { normalizePositiveInteger } from './normalize-positive-integer.mts'

export function getRetentionCutoffDate(retentionDays: number, now = new Date()): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}

export function normalizeRetentionDays(value: number | undefined, defaultValue: number): number {
  return normalizePositiveInteger(value, defaultValue, 'retentionDays')
}

export type OptionalRetentionLimits<T extends { maxBatches?: number }> = Omit<T, 'maxBatches'> & {
  maxBatches?: number
}

/** Fills a cleanup's batch size and per-run cap from the run limits unless it overrides them. */
export function applyRetentionLimits<T extends { batchSize?: number; maxBatches?: number }>(
  limits: DataRetentionLimits,
  overrides: T | undefined,
) {
  return {
    ...overrides,
    batchSize: overrides?.batchSize ?? limits.batchSize,
    maxBatches: overrides?.maxBatches ?? limits.maxBatches,
  }
}
