import { BatchFileBuilder } from '@services/bedrock-embeddings-batch/orchestrator/file-builder'
import { createBatch } from '@services/bedrock-embeddings-batch/orchestrator/create'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'
import onError from '@modules/on-error'

export type CreateBatchResult =
  | { success: true }
  | { reEnqueued: true; reason: string }
  | { failed: true; reason: string; attempted: number }
  | null

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
    if (fileBuilder.getEntityCount() >= limits.maxRecords) {
      break
    }

    const added = await fileBuilder.addEntityIfFits(
      {
        entity_id: entity.id,
        content: entity.content,
        content_sha256: entity.content_sha256,
      },
      limits.maxSizeMB,
    )
    if (!added) break
  }
}

/** Generic batch creation processor to reduce code duplication */
export async function processBatchCreation<T extends BatchEntity>(
  params: {
    jobType: BatchJobType
    streamPending: () => AsyncGenerator<T, void, unknown>
    copyExisting?: () => Promise<unknown>
    reEnqueue: () => unknown
  },
  dependencies: BatchCreationDependencies = defaultBatchCreationDependencies,
): Promise<CreateBatchResult> {
  if (params.copyExisting) {
    await params.copyExisting()
  }

  const limits = await dependencies.getBatchCreationLimits()

  if (!limits.allowed) {
    params.reEnqueue()
    return { reEnqueued: true, reason: limits.reason }
  }

  const fileBuilder = new BatchFileBuilder()
  try {
    await streamEntityBatchUntilLimit(params.streamPending(), fileBuilder, limits)

    if (fileBuilder.getEntityCount() < limits.minRecords) return null

    const { filePath, entityIdsFilePath, entityCount, inputSizeMB } = await fileBuilder.close()
    await dependencies.createBatch(filePath, params.jobType, entityCount, entityIdsFilePath, {
      inputSizeMB,
    })
    return { success: true }
  } finally {
    await fileBuilder.cleanup()
  }
}

export async function processImageBatchCreation<T extends { id: string }>(
  params: {
    streamPending: () => AsyncGenerator<T, void, unknown>
    addImageToBatch: (
      fileBuilder: BatchFileBuilder,
      image: T,
      maxInputSizeMB: number,
    ) => Promise<boolean>
    reEnqueue: () => unknown
  },
  dependencies: BatchCreationDependencies = defaultBatchCreationDependencies,
): Promise<CreateBatchResult> {
  const limits = await dependencies.getBatchCreationLimits()

  if (!limits.allowed) {
    params.reEnqueue()
    return { reEnqueued: true, reason: limits.reason }
  }

  const fileBuilder = new BatchFileBuilder()
  let attempted = 0
  let failures = 0
  try {
    for await (const image of params.streamPending()) {
      if (
        fileBuilder.getEntityCount() >= limits.maxRecords ||
        fileBuilder.getInputSizeMB() >= limits.maxSizeMB
      ) {
        break
      }
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
      } catch (error) {
        failures += 1
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }

    if (fileBuilder.getEntityCount() === 0) {
      if (attempted === 0) return null

      const result = {
        failed: true,
        reason: `Failed to add ${failures}/${attempted} images to Bedrock batch input`,
        attempted,
      } as const
      onError(new Error(result.reason))
      return result
    }
    if (fileBuilder.getEntityCount() < limits.minRecords) {
      return null
    }

    const { filePath, entityIdsFilePath, entityCount, inputSizeMB } = await fileBuilder.close()
    await dependencies.createBatch(filePath, 'images', entityCount, entityIdsFilePath, {
      inputSizeMB,
    })
    return { success: true }
  } finally {
    await fileBuilder.cleanup()
  }
}
