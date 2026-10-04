import type { BatchCreationDependencies, CreateBatchResult } from './types.mts'
export type { BatchCreationDependencies, CreateBatchResult } from './types.mts'
import {
  getPendingEmbeddingScanLimits,
  getEmbeddingCreationRetryDelayMs,
} from '@services/bedrock-embeddings/batch/config'
import type { PendingScanOptions } from './entities/scan-options.mts'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'
import { BatchFileBuilder } from '@services/bedrock-embeddings-batch/orchestrator/file-builder'
import { createBatch } from '@services/bedrock-embeddings-batch/orchestrator/create'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'

type BatchEntity = { id: string; content: string; content_sha256: Buffer }

const defaultBatchCreationDependencies: BatchCreationDependencies = {
  getBatchCreationLimits,
  createBatch,
}

async function streamEntityBatchUntilLimit<T extends BatchEntity>(
  stream: AsyncGenerator<T, void, unknown>,
  fileBuilder: BatchFileBuilder,
  limits: { maxRecords: number; maxSizeMB: number },
): Promise<T | undefined> {
  let lastAccepted: T | undefined
  for await (const entity of stream) {
    const added = await fileBuilder.addEntityIfFits(
      {
        entity_id: entity.id,
        content: entity.content,
        content_sha256: entity.content_sha256,
      },
      limits.maxSizeMB,
    )
    if (!added) return lastAccepted
    lastAccepted = entity
    if (fileBuilder.getEntityCount() >= limits.maxRecords) break
  }
  return undefined
}

/** Generic batch creation processor to reduce code duplication */
export async function processBatchCreation<T extends BatchEntity>(
  params: {
    jobType: BatchJobType
    streamPending: (options?: PendingScanOptions) => AsyncGenerator<T, void, unknown>
    cursor?: EmbeddingScanCursor
    reEnqueue: (cursor?: EmbeddingScanCursor, delayMs?: number) => unknown
  },
  dependencies: BatchCreationDependencies = defaultBatchCreationDependencies,
): Promise<CreateBatchResult> {
  const scanLimits = getPendingEmbeddingScanLimits()
  const limits = await dependencies.getBatchCreationLimits()

  if (!limits.allowed) {
    await params.reEnqueue(
      params.cursor ?? { sweepStartedAt: new Date().toISOString() },
      getEmbeddingCreationRetryDelayMs(),
    )
    return { reEnqueued: true, reason: limits.reason, hasMore: true }
  }

  if (limits.maxRecords < limits.minRecords) {
    await params.reEnqueue(
      params.cursor ?? { sweepStartedAt: new Date().toISOString() },
      getEmbeddingCreationRetryDelayMs(),
    )
    return { reEnqueued: true, reason: 'minimum_record_capacity_unavailable', hasMore: true }
  }
  let progress: { hasMore: boolean; cursor?: EmbeddingScanCursor } = { hasMore: false }
  const streamOptions: PendingScanOptions = {
    limits: scanLimits,
    onComplete: result => {
      progress = result
    },
  }
  const fileBuilder = new BatchFileBuilder()
  try {
    const boundary = await streamEntityBatchUntilLimit(
      params.streamPending(streamOptions),
      fileBuilder,
      limits,
    )
    if (boundary && progress.cursor) {
      const row = boundary as T & { crawl_id?: string; order_index?: number }
      progress.cursor = {
        ...progress.cursor,
        afterId: row.crawl_id ?? row.id,
        ...(row.order_index !== undefined ? { afterOrderIndex: row.order_index } : {}),
      }
    }

    if (fileBuilder.getEntityCount() < limits.minRecords)
      return { empty: true, hasMore: progress.hasMore }

    const { filePath, entityIdsFilePath, entityCount, inputSizeMB } = await fileBuilder.close()
    await dependencies.createBatch(filePath, params.jobType, entityCount, entityIdsFilePath, {
      inputSizeMB,
    })
    return { success: true, hasMore: progress.hasMore }
  } finally {
    await fileBuilder.cleanup()
    if (progress.hasMore && progress.cursor) await params.reEnqueue(progress.cursor)
  }
}

export { processImageBatchCreation } from './image-batch-creation.mts'
