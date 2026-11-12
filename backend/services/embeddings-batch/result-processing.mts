import type { BatchIngestionFence } from './orchestrator/ingestion-transaction.mts'
import type {
  BatchJobType,
  BatchUpdateItem,
  ImageBatchUpdateItem,
} from '@services/embeddings/batch/types'
import { parseBatchResult, isVertexBatchFailure } from './result-parser.mts'
import { streamBatchResults } from '@services/embeddings-batch/orchestrator/results'
import { applyCrawlChunkBatchUpdates } from '@services/embeddings-batch/entities/crawl-chunks'
import { parseCrawlChunkEntityId } from '@services/embeddings-batch/entities/crawl-chunk-entity-id'
import { finalizeChunksIfCompleteForMany } from '@services/crawl-chunks/cleanup'

export const processBatchResultsInBatches = async (
  filePath: string,
  applyUpdates: (updates: BatchUpdateItem[]) => Promise<void>,
  batchSize: number,
  jobType: Exclude<BatchJobType, 'images'>,
  manifest: ReadonlyMap<string, Buffer>,
): Promise<void> => {
  let updates: BatchUpdateItem[] = []

  for await (const result of streamBatchResults(filePath)) {
    const parsed = parseBatchResult(result)
    if (!parsed) {
      if (isVertexBatchFailure(result)) continue
      throw new Error('Malformed successful Vertex batch result')
    }

    if (parsed.entityType === 'image') throw new Error('Expected a text Vertex result')
    const expected = {
      topics: 'topic',
      posts: 'post',
      rss_feed_items: 'rss_feed_item',
      crawl_chunks: 'crawl_chunk',
    }
    if (parsed.entityType !== expected[jobType])
      throw new Error('Vertex result key has the wrong entity type')
    const contentSha256 = manifest.get(result.key!)
    if (!contentSha256) throw new Error('Missing submitted Vertex result manifest hash')
    updates.push({
      entity_id: parsed.entityId,
      content_sha256: contentSha256,
      embedding: parsed.embedding,
      input_token_count: parsed.inputTokenCount,
    })
    if (updates.length >= batchSize) {
      await applyUpdates(updates)
      updates = []
    }
  }

  if (updates.length > 0) await applyUpdates(updates)
}

export const processImageBatchResultsInBatches = async (
  filePath: string,
  applyUpdates: (updates: ImageBatchUpdateItem[]) => Promise<unknown>,
  batchSize: number,
  manifest: ReadonlyMap<string, Buffer>,
): Promise<void> => {
  let updates: ImageBatchUpdateItem[] = []

  for await (const result of streamBatchResults(filePath)) {
    const parsed = parseBatchResult(result)
    if (!parsed) {
      if (isVertexBatchFailure(result)) continue
      throw new Error('Malformed successful Vertex batch result')
    }

    if (parsed.entityType !== 'image') throw new Error('Expected an image Vertex result')
    const imageSha256 = manifest.get(result.key!)
    if (!imageSha256) throw new Error('Missing submitted Vertex image result manifest hash')
    updates.push({
      entity_id: parsed.entityId,
      image_sha_256: imageSha256,
      embedding: parsed.embedding,
    })
    if (updates.length >= batchSize) {
      await applyUpdates(updates)
      updates = []
    }
  }

  if (updates.length > 0) await applyUpdates(updates)
}

export const processCrawlChunkBatchResults = async (
  updates: BatchUpdateItem[],
  fence?: BatchIngestionFence,
): Promise<void> => {
  await applyCrawlChunkBatchUpdates(updates, fence)

  const crawlIds = new Set<string>()
  for (const update of updates) {
    const parsed = parseCrawlChunkEntityId(update.entity_id)
    if (parsed) crawlIds.add(parsed.crawlId)
  }

  await finalizeChunksIfCompleteForMany([...crawlIds])
}
