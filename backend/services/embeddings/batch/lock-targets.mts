import type { BatchJobType } from './types.mts'

export function lockExistsClause(jobType: BatchJobType, entitySql: string): string {
  return `EXISTS (
    SELECT 1 FROM gemini_embedding_batch_entities e
    WHERE ${lockColumn(jobType)} = ${entitySql}
  )`
}

const lockColumns: Record<BatchJobType, string> = {
  topics: 'e.topic_id',
  posts: 'e.post_id',
  rss_feed_items: 'e.rss_feed_item_id',
  crawl_chunks: '(e.crawl_id, e.crawl_order_index)',
  images: 'e.image_id',
}

function lockColumn(jobType: BatchJobType): string {
  return lockColumns[jobType]
}
