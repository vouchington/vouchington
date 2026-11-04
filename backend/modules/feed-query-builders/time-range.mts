import type { TimeRange } from '@voucha/types/feed'
import sql, { type SQLStatement } from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'

/** Window post lists read when the caller sends no time range, for every sort. */
export const DEFAULT_POST_SEARCH_TIME_RANGE: TimeRange = '1m'

/**
 * Generates SQL filter for time range using a UUIDv7 lower bound.
 * Returns null for 'all' which means no time filter.
 *
 * @param timeRange - The time range to filter by
 * @param idColumn - The column name to filter (must be a safe SQL identifier like 'posts.id')
 */
export function buildTimeRangeFilter(
  timeRange: TimeRange,
  idColumn: string,
  now = new Date(),
): SQLStatement | null {
  // Validate idColumn is a safe SQL identifier to prevent SQL injection
  // Format: [table.]column (e.g., 'posts.id' or 'id')
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(idColumn)) {
    throw new Error(`Invalid idColumn format: ${idColumn}`)
  }

  const lowerBoundTimestampMs = getTimeRangeLowerBoundTimestampMs(timeRange, now)
  if (lowerBoundTimestampMs === null) {
    return null
  }

  const lowerBoundUuid = timestampToUuidv7LowerBound(lowerBoundTimestampMs)
  return sql`/* buildTimeRangeFilter:fragment */`
    .append(idColumn)
    .append(sql` >= ${lowerBoundUuid}`)
}

export function getTimeRangeLowerBoundDate(timeRange: TimeRange, now = new Date()): Date | null {
  const lowerBoundTimestampMs = getTimeRangeLowerBoundTimestampMs(timeRange, now)
  return lowerBoundTimestampMs === null ? null : new Date(lowerBoundTimestampMs)
}

function getTimeRangeLowerBoundTimestampMs(timeRange: TimeRange, now = new Date()): number | null {
  switch (timeRange) {
    case '1d':
      return now.getTime() - 24 * 60 * 60 * 1000
    case '1w':
      return now.getTime() - 7 * 24 * 60 * 60 * 1000
    case '1m':
      // Exactly 30 days, so the "Last 30 days" label holds in every calendar month.
      return now.getTime() - 30 * 24 * 60 * 60 * 1000
    case '1y': {
      const cutoff = new Date(now)
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
      return cutoff.getTime()
    }
    case 'all':
      return null
    default: {
      const _exhaustive: never = timeRange
      throw new Error(`Unknown time range: ${_exhaustive}`)
    }
  }
}
