/**
 * Shared utilities for creating PostgreSQL table partitions.
 *
 * These utilities support range partitioning based on UUIDv7 IDs,
 * which encode timestamps in the first 48 bits.
 */

import { getDayBounds } from '@ts-shared/utils/dates'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import {
  DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS,
  DEFAULT_MONTHLY_PARTITION_PAST_MONTHS,
  type MonthlyPartitionTableConfig,
} from './partition-config.mts'

export function getUtcDayUuidv7Bounds(day: string): { startBound: string; endBound: string } {
  const { startMs, endMs } = getDayBounds(day)
  return {
    startBound: timestampToUuidv7LowerBound(startMs),
    endBound: timestampToUuidv7LowerBound(endMs),
  }
}

interface MonthlyPartitionConfig {
  tables: MonthlyPartitionTableConfig[]
  baseDate?: Date
}

/**
 * Generates SQL statements to create monthly range partitions for tables.
 *
 * Creates explicit monthly partitions for a configurable historical/future
 * window. We do not create default partitions for these tables.
 */
export function generateMonthlyPartitions(config: MonthlyPartitionConfig): string {
  const { tables, baseDate = new Date() } = config
  const statements: string[] = []
  const baseYear = baseDate.getUTCFullYear()
  const baseMonth = baseDate.getUTCMonth()

  for (const tableConfig of tables) {
    const {
      table,
      pastMonths = DEFAULT_MONTHLY_PARTITION_PAST_MONTHS,
      futureMonths = DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS,
    } = tableConfig

    for (let offset = -pastMonths; offset <= futureMonths; offset++) {
      const partitionDateMs = Date.UTC(baseYear, baseMonth + offset, 1)
      const nextPartitionDateMs = Date.UTC(baseYear, baseMonth + offset + 1, 1)

      const partitionDate = new Date(partitionDateMs)
      const year = partitionDate.getUTCFullYear()
      const month = partitionDate.getUTCMonth() + 1
      const partitionName = buildMonthlyPartitionName(table, year, month)
      const lowerBound = timestampToUuidv7LowerBound(partitionDateMs)
      const upperBound = timestampToUuidv7LowerBound(nextPartitionDateMs)

      statements.push(`
CREATE TABLE IF NOT EXISTS ${partitionName}
PARTITION OF ${table}
FOR VALUES FROM ('${lowerBound}') TO ('${upperBound}');`)
    }
  }

  return statements.join('\n')
}

export function buildMonthlyPartitionName(table: string, year: number, month: number): string {
  return `${table}__p_${String(year)}_${String(month).padStart(2, '0')}`
}

export function parseMonthlyPartitionName(
  partitionName: string,
): { table: string; year: number; month: number } | null {
  const match = partitionName.match(/^(?<table>[a-z0-9_]+)__p_(?<year>\d{4})_(?<month>\d{2})$/)
  if (!match?.groups) {
    return null
  }

  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return {
    table: match.groups.table,
    year,
    month,
  }
}

export function isMonthlyPartitionExpired(
  partition: { year: number; month: number },
  cutoffDate: Date,
): boolean {
  const upperBoundMs = Date.UTC(partition.year, partition.month, 1)
  return upperBoundMs <= cutoffDate.getTime()
}

/**
 * Generates SQL to create a DEFAULT partition for RANGE-partitioned tables.
 *
 * Used for tables that need RANGE partitioning but have no retention requirements.
 * To split later, CREATE a new partition for a specific range — Postgres routes
 * new inserts there automatically. Existing rows stay in the default partition
 * until explicitly moved.
 */
export function generateDefaultPartitions(tables: string[]): string {
  return tables
    .map(
      table => `
CREATE TABLE IF NOT EXISTS ${table}__default
PARTITION OF ${table} DEFAULT;`,
    )
    .join('\n')
}
