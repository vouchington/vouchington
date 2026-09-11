import { normalizePositiveInteger } from './cleanup-batches.mts'

export function getRetentionCutoffDate(retentionDays: number, now = new Date()): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}

export function normalizeRetentionDays(value: number | undefined, defaultValue: number): number {
  const retentionDays = normalizePositiveInteger(value, defaultValue, 'retentionDays')
  if (!Number.isFinite(retentionDays)) throw new Error('retentionDays must be a finite integer')
  return retentionDays
}
