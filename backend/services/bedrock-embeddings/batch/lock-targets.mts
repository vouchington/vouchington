import type { BatchJobType } from './types.mts'

export type SingleBatchLockType = 'post' | 'topic' | 'rss_feed_item'

export function lockExistsClause(jobType: BatchJobType, entitySql: string): string {
  return `EXISTS (
    SELECT 1 FROM bedrock_embedding_batch_entities e
    WHERE ${lockColumn(jobType)} = ${entitySql}
  )`
}

export function singleLockJobType(entityType: SingleBatchLockType): BatchJobType {
  return (
    {
      __proto__: null,
      post: 'posts',
      topic: 'topics',
      rss_feed_item: 'rss_feed_items',
    } as const
  )[entityType]
}

function lockColumn(jobType: BatchJobType): string {
  return {
    __proto__: null,
    topics: 'e.topic_id',
    posts: 'e.post_id',
    rss_feed_items: 'e.rss_feed_item_id',
    crawl_chunks: '(e.crawl_id, e.crawl_order_index)',
    images: 'e.image_id',
  }[jobType]
}
