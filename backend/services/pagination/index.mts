import type { QueryContract, PaginationRuntimeLimitBounds } from '@modules/pagination'
import {
  clampLimit as clampStaticLimit,
  clampAnonLimit as clampStaticAnonLimit,
} from '@modules/search-utils'
import { getPaginationLimit } from './config.mts'
export * from './config.mts'

const defaultProfiles = {
  3: 'search_default_limit',
  10: 'small_default_limit',
  20: 'trending_default_limit',
  24: 'alias_search_default_limit',
  50: 'large_default_limit',
  100: 'bulk_default_limit',
} as const
const maximumProfiles = {
  25: 'small_max_limit',
  50: 'trending_max_limit',
  200: 'descendants_max_limit',
} as const

export function getPaginationLimits(
  defaultLimit = 25,
  staticMaximum = 100,
): PaginationRuntimeLimitBounds {
  const defaultField =
    defaultProfiles[defaultLimit as keyof typeof defaultProfiles] ?? 'default_limit'
  const maxField = maximumProfiles[staticMaximum as keyof typeof maximumProfiles] ?? 'max_limit'
  const max = Math.min(staticMaximum, getPaginationLimit(maxField))
  return { max, default: Math.max(1, Math.min(max, getPaginationLimit(defaultField))) }
}

export function getPaginationLimitsForContract(
  contract: QueryContract,
): PaginationRuntimeLimitBounds {
  const limit = contract.limit
  if (!limit || limit.kind !== 'integer')
    throw new TypeError('Pagination contract requires an integer limit')
  return getPaginationLimits(limit.default ?? 25, limit.maximum)
}

export function clampLimit(limit?: number, defaultLimit = 25, staticMaximum = 100): number {
  return clampStaticLimit(limit, defaultLimit, getPaginationLimits(defaultLimit, staticMaximum))
}

export function clampAnonLimit(limit: number): number {
  const bounds = getPaginationLimits()
  return clampStaticAnonLimit(limit, {
    ...bounds,
    max: Math.min(bounds.max, getPaginationLimit('anonymous_max_limit')),
  })
}
