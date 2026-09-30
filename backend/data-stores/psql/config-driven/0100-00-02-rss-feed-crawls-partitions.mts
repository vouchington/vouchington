/**
 * Creates monthly range partitions for rss_feed_crawls.
 * Retention is handled by dropping expired monthly partitions, not row deletes.
 */

import { generateMonthlyPartitions } from './utils/partition-utils.mts'
import { RSS_PARTITION_TABLES } from './utils/partition-config.mts'

/** @public loaded by path by the config-driven migration runner */
export default function createRssFeedCrawlsPartitions(): string {
  return generateMonthlyPartitions({
    tables: RSS_PARTITION_TABLES,
  })
}
