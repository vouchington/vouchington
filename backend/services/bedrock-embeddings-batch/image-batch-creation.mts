import {
  getPendingEmbeddingScanLimits,
  getEmbeddingCreationRetryDelayMs,
} from '@services/bedrock-embeddings/batch/config'
import { minimumImageBatchSizeMB } from '@services/bedrock-embeddings/batch/input-size-limits'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'
import { BatchFileBuilder } from './orchestrator/file-builder.mts'
import { getBatchCreationLimits } from './rate-limits.mts'
import { createBatch } from './orchestrator/create.mts'
import type { BatchCreationDependencies, CreateBatchResult } from './types.mts'
import type { PendingScanOptions } from './entities/scan-options.mts'
import onError from '@modules/on-error'

export async function processImageBatchCreation<T extends { id: string }>(
  params: {
    streamPending: (options?: PendingScanOptions) => AsyncGenerator<T, void, unknown>
    addImageToBatch: (
      fileBuilder: BatchFileBuilder,
      image: T,
      maxInputSizeMB: number,
    ) => Promise<boolean>
    cursor?: EmbeddingScanCursor
    reEnqueue: (cursor?: EmbeddingScanCursor, delayMs?: number) => unknown
  },
  dependencies: BatchCreationDependencies = { getBatchCreationLimits, createBatch },
): Promise<CreateBatchResult> {
  const scanLimits = getPendingEmbeddingScanLimits(true)
  const limits = await dependencies.getBatchCreationLimits()

  if (!limits.allowed) {
    await params.reEnqueue(
      params.cursor ?? { sweepStartedAt: new Date().toISOString() },
      getEmbeddingCreationRetryDelayMs(),
    )
    return { reEnqueued: true, reason: limits.reason, hasMore: true }
  }

  if (
    limits.maxRecords < limits.minRecords ||
    limits.maxSizeMB < minimumImageBatchSizeMB(limits.minRecords)
  ) {
    await params.reEnqueue(
      params.cursor ?? { sweepStartedAt: new Date().toISOString() },
      getEmbeddingCreationRetryDelayMs(),
    )
    return { reEnqueued: true, reason: 'minimum_image_capacity_unavailable', hasMore: true }
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
  const carriedIds: string[] = []
  let boundaryId: string | undefined
  let submitted = false
  const attemptedIds = new Set<string>()
  try {
    for await (const image of params.streamPending(streamOptions)) {
      attempted += 1
      attemptedIds.add(image.id)
      try {
        const added = await params.addImageToBatch(fileBuilder, image, limits.maxSizeMB)
        if (!added) {
          failures += 1
          if (fileBuilder.getEntityCount() === 0) {
            onError(new Error(`Image ${image.id} exceeds Bedrock batch input size limit`))
            continue
          }
          boundaryId = image.id
          break
        }
        carriedIds.push(image.id)
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
    submitted = true
    return { success: true, hasMore: progress.hasMore }
  } finally {
    await fileBuilder.cleanup()
    if (progress.hasMore && progress.cursor) {
      const unattempted = progress.cursor.pendingImageIds?.filter(id => !attemptedIds.has(id)) ?? []
      const pendingImageIds = [
        ...new Set([
          ...unattempted,
          ...(submitted ? [] : carriedIds),
          ...(boundaryId ? [boundaryId] : []),
        ]),
      ]
      await params.reEnqueue({
        ...progress.cursor,
        pendingImageIds,
      })
    }
  }
}
