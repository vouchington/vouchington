import {
  assertSafeSqlIdentifier,
  type ExpiredMonthlyPartition,
} from '@vouchington/postgres/partitions'
import type { QueryExecutor } from '../types.mts'

/** Partition retirement must perform app-specific referential actions: DROP does not fire them. */
export async function beforeRetireMonthlyPartition(
  query: QueryExecutor,
  partition: ExpiredMonthlyPartition,
): Promise<void> {
  const table = assertSafeSqlIdentifier(partition.table)
  const partitionName = assertSafeSqlIdentifier(partition.partitionName)
  if (table === 'crawl_chunks') {
    await query(`/* retireMonthlyPartition:deleteChunkBatchEntities */
      DELETE FROM bedrock_embedding_batch_entities AS entity
      USING ${partitionName} AS chunk
      WHERE entity.crawl_id = chunk.crawl_id AND entity.crawl_order_index = chunk.order_index`)
  } else if (table === 'crawls') {
    await query(`/* retireMonthlyPartition:clearBatchCrawls */
      UPDATE bedrock_embedding_batches SET crawl_id = NULL
      WHERE crawl_id IN (SELECT id FROM ${partitionName})`)
    await query(`/* retireMonthlyPartition:clearReferralCrawls */
      UPDATE user_referral_program_links SET last_crawl_id = NULL
      WHERE last_crawl_id IN (SELECT id FROM ${partitionName})`)
    // Also handles chunks whose partition was retained after an earlier retirement failure.
    // Row deletion cascades to embedding batch entities before the crawls parent is detached.
    await query(`/* retireMonthlyPartition:deleteCrawlChunks */
      DELETE FROM crawl_chunks WHERE crawl_id IN (SELECT id FROM ${partitionName})`)
  }
}
