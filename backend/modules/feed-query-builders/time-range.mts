import type { TimeRange } from '@voucha/types/feed'
import sql, { type SQLStatement } from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'

/**
 * Generates SQL filter for time range using a UUIDv7 lower bound.
 * Returns null for 'all' which means no time filter.
 *
 * @param timeRange - The time range to filter by
 * @param idColumn - The column name to filter (must be a safe SQL identifier like 'posts.id')
 */
export function buildTimeRangeFilter(timeRange: TimeRange, idColumn: string): SQLStatement | null {
  // Validate idColumn is a safe SQL identifier to prevent SQL injection
  // Format: [table.]column (e.g., 'posts.id' or 'id')
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(idColumn)) {
    throw new Error(`Invalid idColumn format: ${idColumn}`)
  }

  const lowerBoundTimestampMs = getTimeRangeLowerBoundTimestampMs(timeRange)
  if (lowerBoundTimestampMs === null) {
    return null
  }

  const lowerBoundUuid = timestampToUuidv7LowerBound(lowerBoundTimestampMs)
  return sql`/* buildTimeRangeFilter:fragment */`
    .append(idColumn)
    .append(sql` >= ${lowerBoundUuid}`)
}

export function getTimeRangeLowerBoundDate(timeRange: TimeRange): Date | null {
  const lowerBoundTimestampMs = getTimeRangeLowerBoundTimestampMs(timeRange)
  return lowerBoundTimestampMs === null ? null : new Date(lowerBoundTimestampMs)
}

function getTimeRangeLowerBoundTimestampMs(timeRange: TimeRange): number | null {
  const now = new Date()
  switch (timeRange) {
    case '1d':
      return now.getTime() - 24 * 60 * 60 * 1000
    case '1w':
      return now.getTime() - 7 * 24 * 60 * 60 * 1000
    case '1m': {
      const cutoff = new Date(now)
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 1)
      return cutoff.getTime()
    }
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
