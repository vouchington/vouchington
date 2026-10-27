import { getEmbeddingCreationRetryDelayMs } from '@services/bedrock-embeddings/batch/config'
import {
  minimumImageBatchSizeMB,
  minimumTextBatchSizeMB,
} from '@services/bedrock-embeddings/batch/input-size-limits'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { getCpuProviderCooldownRemainingMs } from '@services/bedrock-embeddings/provider-cooldown'
import { BatchCreationDeferredError } from './orchestrator/create.mts'
import type { BatchCreationDependencies } from './types.mts'

/** Recheck actual candidate capacity after S3 preparation, before external submission. */
export function creationSubmissionAdmission(options: {
  dependencies: BatchCreationDependencies
  isLeaseHeld: () => boolean
  jobType: BatchJobType
  entityCount: number
  inputSizeMB: number
}) {
  return async (preparingBatchId: string): Promise<void> => {
    if (!options.isLeaseHeld()) throw new BatchCreationDeferredError('lease_lost', 0)
    // The current Preparing row already contributes its records to the hourly sum. Exclude
    // only that row here; all other Preparing and submitted rows still count.
    const limits = await options.dependencies.getBatchCreationLimits(
      new Date(),
      {},
      preparingBatchId,
    )
    if (!options.isLeaseHeld()) throw new BatchCreationDeferredError('lease_lost', 0)
    const minimumSize = limits.allowed
      ? options.jobType === 'images'
        ? minimumImageBatchSizeMB(limits.minRecords)
        : minimumTextBatchSizeMB(limits.minRecords)
      : 0
    if (
      !limits.allowed ||
      options.entityCount < limits.minRecords ||
      limits.maxRecords < limits.minRecords ||
      limits.maxSizeMB < minimumSize ||
      limits.maxRecords < options.entityCount ||
      limits.maxSizeMB < options.inputSizeMB
    )
      throw new BatchCreationDeferredError(
        'quota_changed_before_submit',
        getEmbeddingCreationRetryDelayMs(),
      )
    // A different creation type can receive a 429 while this batch uploads to S3.
    const remainingMs = await getCpuProviderCooldownRemainingMs('bedrock-embeddings:creation')
    if (!options.isLeaseHeld()) throw new BatchCreationDeferredError('lease_lost', 0)
    if (remainingMs) throw new BatchCreationDeferredError('provider_cooldown', remainingMs)
  }
}
