import onError from '@modules/on-error'
import {
  assertSafeSqlIdentifier,
  cleanupMonthlyPartitions,
  createMonthlyPartitions as createPlatformMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import {
  ALL_MONTHLY_PARTITION_TABLES,
  MONTHLY_PARTITION_RETENTION_TABLES,
} from '../config-driven/utils/partition-config.mts'
import { beginTransaction, write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { beforeRetireMonthlyPartition } from './before-retire-monthly-partition.mts'

const RSS_FEED_CRAWLS_DEFAULT_PARTITION = 'rss_feed_crawls__default'

export async function dropRssFeedCrawlsDefaultPartition(
  writer: QueryExecutor = write,
): Promise<void> {
  const table = assertSafeSqlIdentifier(RSS_FEED_CRAWLS_DEFAULT_PARTITION)
  await writer(`/* dropRssFeedCrawlsDefaultPartition */ DROP TABLE IF EXISTS ${table}`)
}

export async function createMonthlyPartitions(writer: QueryExecutor = write): Promise<void> {
  await dropRssFeedCrawlsDefaultPartition(writer)
  await createPlatformMonthlyPartitions(writer, { tables: ALL_MONTHLY_PARTITION_TABLES })
}

export async function cleanupPartitions(referenceDate: Date = new Date()): Promise<void> {
  await cleanupMonthlyPartitions({
    query: write,
    tables: MONTHLY_PARTITION_RETENTION_TABLES,
    referenceDate,
    startTransaction: beginTransaction,
    reportError: onError,
    beforeDetach: beforeRetireMonthlyPartition,
  })
}
