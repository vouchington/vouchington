import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import type { RssFeedItemToUpsert } from '@services/rss-feed-items/types'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { copyExistingEmbeddings, applyBatchUpdates } from '../orchestrator/save.mts'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import {
  reusableEmbeddingMissingClause,
  streamPendingEntities,
  type PendingEntity,
} from './shared.mts'
import { enqueueBulkStoryClustering } from '@queues/ai-agents/enqueues/story-clustering'

type PendingRssFeedItem = PendingEntity

export async function copyExistingRssFeedItemEmbeddings(): Promise<void> {
  const updatedIds = await copyExistingEmbeddings('rss_feed_items')
  if (updatedIds.length > 0) {
    await enqueueBulkStoryClustering(updatedIds.map(id => ({ rss_feed_item_id: id })))
  }
}

export async function* streamPendingRssFeedItems(): AsyncGenerator<
  PendingRssFeedItem,
  void,
  unknown
> {
  const query = `/* streamPendingRssFeedItems */
    SELECT r.id::text AS id, r.data
    FROM rss_feed_items r
    WHERE (
        r.bedrock_nova_multimodal_v1_input_sha256 IS NULL
        OR r.bedrock_nova_multimodal_v1_input_sha256 != r.bedrock_nova_multimodal_v1_content_sha256
      )
      AND ${reusableEmbeddingMissingClause('r')}
      AND NOT ${lockExistsClause('rss_feed_items', 'r.id')}
    ORDER BY r.id DESC
  `

  yield* streamPendingEntities<{ id: string; data: RssFeedItemToUpsert }>(
    createAsyncGeneratorFromCursor(query, [], { batchSize: 1000 }),
    row => createRssFeedItemEmbeddingContent(row.data),
  )
}

export async function applyRssFeedItemBatchUpdates(items: BatchUpdateItem[]): Promise<void> {
  const updatedIds = await applyBatchUpdates('rss_feed_items', items)
  if (updatedIds.length > 0) {
    await enqueueBulkStoryClustering(updatedIds.map(id => ({ rss_feed_item_id: id })))
  }
}
