import type { BatchJobType } from './types.mts'

export type SingleBatchLockType = 'post' | 'topic' | 'rss_feed_item'

export function lockExistsClause(jobType: BatchJobType, entitySql: string): string {
  return `EXISTS (
    SELECT 1 FROM bedrock_embeddings_batch_entities e
    WHERE ${lockColumn(jobType)} = ${entitySql}
  )`
}

export function singleLockJobType(entityType: SingleBatchLockType): BatchJobType {
  switch (entityType) {
    case 'post':
      return 'posts'
    case 'topic':
      return 'topics'
    case 'rss_feed_item':
      return 'rss_feed_items'
  }
}

function lockColumn(jobType: BatchJobType): string {
  switch (jobType) {
    case 'topics':
      return 'e.topic_id'
    case 'posts':
      return 'e.post_id'
    case 'rss_feed_items':
      return 'e.rss_feed_item_id'
    case 'crawl_chunks':
      return '(e.crawl_id, e.crawl_order_index)'
    case 'images':
      return 'e.image_id'
  }
}
