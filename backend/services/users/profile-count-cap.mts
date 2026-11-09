import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const PROFILE_COUNT_CAP_DEFAULT = 1_000
export const PROFILE_COUNT_CAP_MAX_VALUE = 10_000

export const profileCountConfig = new DynamicConfig({
  key: 'profile-count-config',
  fieldTypes: { count_cap: 'number' },
  defaultFields: { count_cap: PROFILE_COUNT_CAP_DEFAULT },
})

export type CappedCount = { count: number; capped: boolean }

export function getProfileCountCap(): number {
  return getBoundedPositiveIntegerField(profileCountConfig, 'count_cap', {
    defaultValue: PROFILE_COUNT_CAP_DEFAULT,
    maxValue: PROFILE_COUNT_CAP_MAX_VALUE,
  })
}

/** Rows to read per count: one past the cap, so an extra row proves the count is capped. */
export function profileCountProbeLimit(cap: number): number {
  return cap + 1
}

/** Turns a count read through `LIMIT cap + 1` into the exact count up to `cap` plus a flag. */
export function toCappedCount(
  rawCount: number | string | null | undefined,
  cap: number,
): CappedCount {
  const raw = Number(rawCount) || 0
  return { count: Math.min(raw, cap), capped: raw > cap }
}
