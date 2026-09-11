import { write } from '../setup.mts'
import {
  generateMonthlyPartitions,
  isMonthlyPartitionExpired,
  parseMonthlyPartitionName,
} from '../config-driven/utils/partition-utils.mts'
import {
  ALL_MONTHLY_PARTITION_TABLES,
  MONTHLY_PARTITION_RETENTION_TABLES,
  type MonthlyPartitionTableConfig,
} from '../config-driven/utils/partition-config.mts'
import type { QueryExecutor } from '../types.mts'

type ExistingMonthlyPartitionRow = {
  parent_table: string
  partition_table: string
}

export type ExpiredMonthlyPartition = {
  table: string
  partitionName: string
  dropPriority: number
  year: number
  month: number
}

function assertSafeSqlIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/u.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`)
  }
  return identifier
}

const RSS_FEED_CRAWLS_DEFAULT_PARTITION = 'rss_feed_crawls__default'

export async function dropRssFeedCrawlsDefaultPartition(
  writer: QueryExecutor = write,
): Promise<void> {
  const table = assertSafeSqlIdentifier(RSS_FEED_CRAWLS_DEFAULT_PARTITION)
  await writer(`/* dropRssFeedCrawlsDefaultPartition */ DROP TABLE IF EXISTS ${table}`)
}

export function getMonthlyPartitionCutoffDate(referenceDate: Date, retentionDays: number): Date {
  return new Date(referenceDate.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}

export function selectExpiredMonthlyPartitions(
  existingPartitions: ExistingMonthlyPartitionRow[],
  tableConfigs: MonthlyPartitionTableConfig[],
  referenceDate: Date,
): ExpiredMonthlyPartition[] {
  const configByTable = new Map(tableConfigs.map(config => [config.table, config]))
  const expiredPartitions: ExpiredMonthlyPartition[] = []

  for (const existingPartition of existingPartitions) {
    const config = configByTable.get(existingPartition.parent_table)
    if (config?.retentionDays === undefined) {
      continue
    }

    const parsedPartition = parseMonthlyPartitionName(existingPartition.partition_table)
    if (!parsedPartition || parsedPartition.table !== existingPartition.parent_table) {
      continue
    }

    const cutoffDate = getMonthlyPartitionCutoffDate(referenceDate, config.retentionDays)
    if (
      !isMonthlyPartitionExpired(
        { year: parsedPartition.year, month: parsedPartition.month },
        cutoffDate,
      )
    ) {
      continue
    }

    expiredPartitions.push({
      table: config.table,
      partitionName: existingPartition.partition_table,
      dropPriority: config.dropPriority ?? Number.MAX_SAFE_INTEGER,
      year: parsedPartition.year,
      month: parsedPartition.month,
    })
  }

  return expiredPartitions.toSorted((left, right) => {
    if (left.dropPriority !== right.dropPriority) {
      return left.dropPriority - right.dropPriority
    }
    if (left.year !== right.year) {
      return left.year - right.year
    }
    if (left.month !== right.month) {
      return left.month - right.month
    }
    return left.partitionName.localeCompare(right.partitionName)
  })
}

async function getExistingManagedMonthlyPartitions(
  tableConfigs: MonthlyPartitionTableConfig[],
): Promise<ExistingMonthlyPartitionRow[]> {
  const tableNames = tableConfigs.map(config => assertSafeSqlIdentifier(config.table))
  if (tableNames.length === 0) {
    return []
  }

  const { rows } = await write(
    `/* getExistingManagedMonthlyPartitions */
      SELECT
        parent.relname AS parent_table,
        child.relname AS partition_table
      FROM pg_inherits
      JOIN pg_class AS parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class AS child ON pg_inherits.inhrelid = child.oid
      JOIN pg_namespace AS namespace ON parent.relnamespace = namespace.oid
      WHERE namespace.nspname = current_schema()
        AND parent.relname = ANY($1::text[])
    `,
    [tableNames],
  )

  return rows
}

export async function createMonthlyPartitions(): Promise<void> {
  await dropRssFeedCrawlsDefaultPartition()
  const sql = generateMonthlyPartitions({ tables: ALL_MONTHLY_PARTITION_TABLES })
  await write(sql)
}

export async function cleanupPartitions(referenceDate: Date = new Date()): Promise<void> {
  const existingPartitions = await getExistingManagedMonthlyPartitions(
    MONTHLY_PARTITION_RETENTION_TABLES,
  )
  const expiredPartitions = selectExpiredMonthlyPartitions(
    existingPartitions,
    MONTHLY_PARTITION_RETENTION_TABLES,
    referenceDate,
  )

  if (expiredPartitions.length === 0) {
    return
  }

  const sql = expiredPartitions
    .map(partition => `DROP TABLE IF EXISTS ${assertSafeSqlIdentifier(partition.partitionName)};`)
    .join('\n')
  await write(sql)
}
