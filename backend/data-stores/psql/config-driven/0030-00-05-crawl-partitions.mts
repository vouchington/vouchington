/**
 * Creates monthly range partitions for crawl tables.
 * Retention is handled by dropping expired monthly partitions, not row deletes.
 * Drop order: crawl_chunks first (FK dependency), then crawls.
 */

import { generateMonthlyPartitions } from './utils/partition-utils.mts'
import { CRAWL_PARTITION_TABLES } from './utils/partition-config.mts'

/** @internal */
export default function createCrawlPartitions(): string {
  return generateMonthlyPartitions({
    tables: CRAWL_PARTITION_TABLES,
  })
}
