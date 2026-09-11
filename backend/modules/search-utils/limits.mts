export const MIN_LIMIT = 1
export const MAX_LIMIT = 100
export const DEFAULT_LIMIT = 25
export const ANON_MAX_LIMIT = 25
export const TRENDING_TOPICS_DEFAULT_LIMIT = 20

export function clampAnonLimit(limit: number): number {
  const value = Number.isFinite(limit) ? limit : DEFAULT_LIMIT
  return Math.min(Math.max(MIN_LIMIT, value), ANON_MAX_LIMIT)
}

export function clampLimit(limit?: number, defaultLimit?: number): number {
  const fallback = defaultLimit ?? DEFAULT_LIMIT
  const value = limit !== undefined && Number.isFinite(limit) ? limit : fallback
  return Math.min(Math.max(MIN_LIMIT, value), MAX_LIMIT)
}

const DEFAULT_MAX_DEPTH = 6
const MAX_MAX_DEPTH = 25
const MIN_MAX_DEPTH = 1

export function clampMaxDepth(maxDepth?: number): number {
  return Math.min(Math.max(MIN_MAX_DEPTH, maxDepth ?? DEFAULT_MAX_DEPTH), MAX_MAX_DEPTH)
}
