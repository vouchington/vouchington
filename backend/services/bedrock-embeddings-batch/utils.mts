import { getPendingEmbeddingScanLimits } from '@services/bedrock-embeddings/batch/config'
import type { PendingScanOptions } from './entities/scan-options.mts'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'
import { BatchFileBuilder } from '@services/bedrock-embeddings-batch/orchestrator/file-builder'
import { createBatch } from '@services/bedrock-embeddings-batch/orchestrator/create'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'
import onError from '@modules/on-error'

export type CreateBatchResult = { hasMore: boolean } & (
  | { success: true }
  | { reEnqueued: true; reason: string }
  | { failed: true; reason: string; attempted: number }
  | { empty: true }
)

type BatchEntity = { id: string; content: string; content_sha256: Buffer }

type BatchCreationDependencies = {
  getBatchCreationLimits: typeof getBatchCreationLimits
  createBatch: typeof createBatch
}

const defaultBatchCreationDependencies: BatchCreationDependencies = {
  getBatchCreationLimits,
  createBatch,
}

async function streamEntityBatchUntilLimit<T extends BatchEntity>(
  stream: AsyncGenerator<T, void, unknown>,
  fileBuilder: BatchFileBuilder,
  limits: { maxRecords: number; maxSizeMB: number },
): Promise<void> {
  for await (const entity of stream) {
    const added = await fileBuilder.addEntityIfFits(
      {
        entity_id: entity.id,
        content: entity.content,
        content_sha256: entity.content_sha256,
      },
      limits.maxSizeMB,
    )
    if (!added || fileBuilder.getEntityCount() >= limits.maxRecords) break
  }
}

/** Generic batch creation processor to reduce code duplication */
export async function processBatchCreation<T extends BatchEntity>(
  params: {
    jobType: BatchJobType
    streamPending: (options?: PendingScanOptions) => AsyncGenerator<T, void, unknown>
    cursor?: EmbeddingScanCursor
    reEnqueue: (cursor?: EmbeddingScanCursor) => unknown
  },
  dependencies: BatchCreationDependencies = defaultBatchCreationDependencies,
): Promise<CreateBatchResult> {
  const scanLimits = getPendingEmbeddingScanLimits()
  const limits = await dependencies.getBatchCreationLimits()

  if (!limits.allowed) {
    await params.reEnqueue(params.cursor)
    return { reEnqueued: true, reason: limits.reason, hasMore: true }
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
    await streamEntityBatchUntilLimit(params.streamPending(streamOptions), fileBuilder, limits)

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

export async function processImageBatchCreation<T extends { id: string }>(
  params: {
    streamPending: (options?: PendingScanOptions) => AsyncGenerator<T, void, unknown>
    addImageToBatch: (
      fileBuilder: BatchFileBuilder,
      image: T,
      maxInputSizeMB: number,
    ) => Promise<boolean>
    cursor?: EmbeddingScanCursor
    reEnqueue: (cursor?: EmbeddingScanCursor) => unknown
  },
  dependencies: BatchCreationDependencies = defaultBatchCreationDependencies,
): Promise<CreateBatchResult> {
  const scanLimits = getPendingEmbeddingScanLimits(true)
  const limits = await dependencies.getBatchCreationLimits()

  if (!limits.allowed) {
    await params.reEnqueue(params.cursor)
    return { reEnqueued: true, reason: limits.reason, hasMore: true }
  }

  let progress: { hasMore: boolean; cursor?: EmbeddingScanCursor } = { hasMore: false }
  const streamOptions: PendingScanOptions = {
    limits: scanLimits,
    onComplete: result => {
      progress = result
    },
  }
  const fileBuilder = new BatchFileBuilder()
  let attempted = 0
  let failures = 0
  try {
    for await (const image of params.streamPending(streamOptions)) {
      attempted += 1
      try {
        const added = await params.addImageToBatch(fileBuilder, image, limits.maxSizeMB)
        if (!added) {
          failures += 1
          if (fileBuilder.getEntityCount() === 0) {
            onError(new Error(`Image ${image.id} exceeds Bedrock batch input size limit`))
            continue
          }
          break
        }
      } catch (err) {
        failures += 1
        onError(err instanceof Error ? err : new Error(String(err)))
      }
      if (
        fileBuilder.getEntityCount() >= limits.maxRecords ||
        fileBuilder.getInputSizeMB() >= limits.maxSizeMB
      )
        break
    }

    if (fileBuilder.getEntityCount() === 0) {
      if (attempted === 0) return { empty: true, hasMore: progress.hasMore }

      const result = {
        failed: true,
        reason: `Failed to add ${failures}/${attempted} images to Bedrock batch input`,
        attempted,
        hasMore: progress.hasMore,
      } as const
      onError(new Error(result.reason))
      return result
    }
    if (fileBuilder.getEntityCount() < limits.minRecords) {
      return { empty: true, hasMore: progress.hasMore }
    }

    const { filePath, entityIdsFilePath, entityCount, inputSizeMB } = await fileBuilder.close()
    await dependencies.createBatch(filePath, 'images', entityCount, entityIdsFilePath, {
      inputSizeMB,
    })
    return { success: true, hasMore: progress.hasMore }
  } finally {
    await fileBuilder.cleanup()
    if (progress.hasMore && progress.cursor) await params.reEnqueue(progress.cursor)
  }
}
