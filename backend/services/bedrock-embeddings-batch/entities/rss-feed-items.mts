import { createPendingScan, type PendingScanOptions } from './scan-options.mts'
import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import type { RssFeedItemToUpsert } from '@services/rss-feed-items/types'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { applyBatchUpdates } from '../orchestrator/save.mts'
import {
  copyExistingEmbeddings,
  type EmbeddingReconciliationOptions,
  type EmbeddingReconciliationPage,
} from '../orchestrator/reconcile-existing.mts'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import {
  reusableEmbeddingMissingClause,
  streamPendingEntities,
  type PendingEntity,
} from './shared.mts'
import { dispatchStoryClusteringForEmbeddedItems } from '@services/stories/clustering/dispatch'

type PendingRssFeedItem = PendingEntity

export async function copyExistingRssFeedItemEmbeddings(
  options: EmbeddingReconciliationOptions = {},
): Promise<EmbeddingReconciliationPage> {
  const page = await copyExistingEmbeddings('rss_feed_items', options)
  await dispatchStoryClusteringForEmbeddedItems(page.updatedIds)
  return page
}

export async function* streamPendingRssFeedItems(
  options: PendingScanOptions = {},
): AsyncGenerator<PendingRssFeedItem, void, unknown> {
  const scan = createPendingScan(options)
  const query = `/* streamPendingRssFeedItems */
    SELECT r.id::text AS id, r.data
    FROM rss_feed_items r
    WHERE r.id < $1::uuid AND ($2::uuid IS NULL OR r.id < $2::uuid)
      AND (
        r.bedrock_nova_multimodal_v1_input_sha256 IS NULL
        OR r.bedrock_nova_multimodal_v1_input_sha256 != r.bedrock_nova_multimodal_v1_content_sha256
      )
      AND ${reusableEmbeddingMissingClause('r')}
      AND NOT ${lockExistsClause('rss_feed_items', 'r.id')}
    ORDER BY r.id DESC
  `

  yield* streamPendingEntities<{ id: string; data: RssFeedItemToUpsert }>(
    createAsyncGeneratorFromCursor<{ id: string; data: RssFeedItemToUpsert }>(
      query,
      [scan.upperId, scan.afterId],
      { batchSize: scan.limits.batchSize, maxRows: scan.limits.maxRows, onComplete: scan.complete },
    ),
    row => createRssFeedItemEmbeddingContent(row.data),
  )
}

export async function applyRssFeedItemBatchUpdates(items: BatchUpdateItem[]): Promise<void> {
  const updatedIds = await applyBatchUpdates('rss_feed_items', items)
  await dispatchStoryClusteringForEmbeddedItems(updatedIds)
}
