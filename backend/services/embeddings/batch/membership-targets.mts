import type { BatchJobType } from './types.mts'

export function activeBatchMembershipExistsClause(
  jobType: BatchJobType,
  entitySql: string,
): string {
  return `EXISTS (
    SELECT 1 FROM gemini_embedding_batch_entities e
    JOIN gemini_embedding_batches b ON b.id = e.batch_id
    WHERE b.completed_at IS NULL AND b.failed_at IS NULL AND b.cancelled_at IS NULL
      AND ${membershipColumn(jobType)} = ${entitySql}
  )`
}

const membershipColumns: Record<BatchJobType, string> = {
  topics: 'e.topic_id',
  posts: 'e.post_id',
  rss_feed_items: 'e.rss_feed_item_id',
  crawl_chunks: '(e.crawl_id, e.crawl_order_index)',
  images: 'e.image_id',
}

function membershipColumn(jobType: BatchJobType): string {
  return membershipColumns[jobType]
}
