/**
 * Creates monthly range partitions for rss_feed_crawls.
 * Retention is handled by dropping expired monthly partitions, not row deletes.
 */

import { generateMonthlyPartitions } from './utils/partition-utils.mts'
import { RSS_PARTITION_TABLES } from './utils/partition-config.mts'

export default function createRssFeedCrawlsPartitions(): string {
  return generateMonthlyPartitions({
    tables: RSS_PARTITION_TABLES,
  })
}
