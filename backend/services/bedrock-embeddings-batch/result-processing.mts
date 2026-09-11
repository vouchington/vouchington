import type { BatchResultItem } from '@services/bedrock-embeddings-batch/orchestrator/shared'
import { streamBatchResults } from '@services/bedrock-embeddings-batch/orchestrator/results'
import { applyCrawlChunkBatchUpdates } from '@services/bedrock-embeddings-batch/entities/crawl-chunks'
import { parseCrawlChunkEntityId } from '@services/bedrock-embeddings-batch/entities/crawl-chunk-entity-id'
import type {
  BatchUpdateItem,
  ImageBatchUpdateItem,
} from '@services/bedrock-embeddings/batch/types'
import { finalizeChunksIfCompleteForMany } from '@services/crawl-chunks/cleanup'

export const processBatchResultsInBatches = async (
  filePath: string,
  applyUpdates: (updates: BatchUpdateItem[]) => Promise<void>,
  batchSize: number = 1000,
): Promise<void> => {
  let updates: BatchUpdateItem[] = []

  for await (const result of streamBatchResults(filePath)) {
    if (result.error) continue
    const embedding = extractBatchEmbedding(result)
    if (!embedding) continue

    try {
      const metadata = JSON.parse(result.recordId) as {
        entity_id: string
        content_sha256: string
      }
      updates.push({
        entity_id: metadata.entity_id,
        content_sha256: Buffer.from(metadata.content_sha256, 'hex'),
        embedding,
        input_token_count: result.modelOutput?.inputTokenCount ?? null,
      })
      if (updates.length >= batchSize) {
        await applyUpdates(updates)
        updates = []
      }
    } catch {
      continue
    }
  }

  if (updates.length > 0) await applyUpdates(updates)
}

export const processImageBatchResultsInBatches = async (
  filePath: string,
  applyUpdates: (updates: ImageBatchUpdateItem[]) => Promise<unknown>,
  batchSize: number = 1000,
): Promise<void> => {
  let updates: ImageBatchUpdateItem[] = []

  for await (const result of streamBatchResults(filePath)) {
    if (result.error) continue
    const embedding = extractBatchEmbedding(result)
    if (!embedding) continue

    try {
      const metadata = JSON.parse(result.recordId) as {
        entity_id: string
        image_sha_256: string
      }
      updates.push({
        entity_id: metadata.entity_id,
        image_sha_256: Buffer.from(metadata.image_sha_256, 'hex'),
        embedding,
      })
      if (updates.length >= batchSize) {
        await applyUpdates(updates)
        updates = []
      }
    } catch {
      continue
    }
  }

  if (updates.length > 0) await applyUpdates(updates)
}

function extractBatchEmbedding(result: BatchResultItem): number[] | undefined {
  if (result.modelOutput?.embedding) return result.modelOutput.embedding

  const embedding = result.modelOutput?.embeddings?.[0]
  if (Array.isArray(embedding)) return embedding
  return embedding?.embedding
}

export const processCrawlChunkBatchResults = async (updates: BatchUpdateItem[]): Promise<void> => {
  await applyCrawlChunkBatchUpdates(updates)

  const crawlIds = new Set<string>()
  for (const update of updates) {
    const parsed = parseCrawlChunkEntityId(update.entity_id)
    if (parsed) crawlIds.add(parsed.crawlId)
  }

  await finalizeChunksIfCompleteForMany([...crawlIds])
}
