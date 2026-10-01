import type { GrowthRange } from './types.mts'
const VALID_RANGES = new Set<GrowthRange>(['today', '7d', '30d', '90d', 'all'])
export function parseGrowthMetricsRange(raw: unknown): GrowthRange {
  return typeof raw === 'string' && VALID_RANGES.has(raw as GrowthRange)
    ? (raw as GrowthRange)
    : '30d'
}
