import { stat, unlink } from 'node:fs/promises'
import { write } from '@data-stores/psql'
import onError from '@modules/on-error'
import { mintUUIDv7 } from '@modules/utils/ids'
import {
  MAX_BATCH_INPUT_BYTES,
  MAX_BATCH_RECORDS,
} from '@services/embeddings/batch/input-size-limits'
import type { BatchJobType } from '@services/embeddings/batch/types'
import type { BatchMetadata, BatchSource } from './shared.mts'
import { cleanupBatchLocks } from './cleanup.mts'
import { stopVertexBatch, createVertexBatch } from '../provider.mts'
import { GoogleBatchApiError } from '../google-http.mts'
import { gcsUri, uploadGcsFile } from '../gcs.mts'
import { requireVertexEnvironment } from '@services/embeddings/vertex'
import {
  batchDocument,
  insertBatchAndLockRows,
  markBatchSubmittedForPolling,
} from './persist-batch.mts'

/** A prepared batch was never submitted; its original creation job may safely be retried. */
export class BatchCreationDeferredError extends Error {
  readonly reason: string
  readonly delayMs: number
  constructor(reason: string, delayMs: number) {
    super(`Embedding batch creation deferred: ${reason}`)
    this.reason = reason
    this.delayMs = delayMs
  }
}

export const createBatch = async (
  filePath: string,
  jobType: BatchJobType,
  entityCount: number,
  entityIdsFilePath: string,
  metadata: BatchMetadata | undefined,
  source: BatchSource | undefined,
  beforeSubmit: (preparingBatchId: string) => Promise<void>,
  isLeaseHeld: () => boolean,
): Promise<string> => {
  const batchId = mintUUIDv7()
  const prefix = metadata?.storagePrefix ?? `gemini-embeddings/${batchId}/`
  const inputKey = `${prefix}input.jsonl`
  const inputUri = gcsUri(inputKey)
  const outputUri = gcsUri(`${prefix}output/`)
  const batchMetadata = metadata ?? {}
  let submittedJobName: string | undefined
  let batchPersisted = false
  let submissionStarted = false
  try {
    requireVertexEnvironment('VERTEX_PROJECT_ID')
    if (!Number.isSafeInteger(entityCount) || entityCount < 1 || entityCount > MAX_BATCH_RECORDS)
      throw new Error('Vertex batch record limit exceeded')
    if ((await stat(filePath)).size > MAX_BATCH_INPUT_BYTES)
      throw new Error('Vertex batch input byte limit exceeded')
    await insertBatchAndLockRows({
      batchId,
      jobType,
      entityCount,
      entityIdsFilePath,
      data: batchDocument('JOB_STATE_PENDING', inputUri, outputUri, batchMetadata),
      urlId: source?.urlId ?? null,
      crawlId: source?.crawlId ?? null,
    })
    batchPersisted = true
    await uploadGcsFile(filePath, inputKey)
    await uploadGcsFile(entityIdsFilePath, `${prefix}manifest.csv`)
    await beforeSubmit(batchId)
    if (!isLeaseHeld()) throw new BatchCreationDeferredError('lease_lost', 0)
    // Persist the domain submission intent before contacting Vertex. A lost response must
    // remain discoverable by deterministic displayName instead of releasing its entity locks.
    await markBatchSubmittedForPolling(
      batchId,
      undefined,
      batchDocument('JOB_STATE_PENDING', inputUri, outputUri, batchMetadata),
    )
    submissionStarted = true
    const job = await createVertexBatch(batchId, inputUri, outputUri)
    submittedJobName = job.name
    await markBatchSubmittedForPolling(
      batchId,
      job.name,
      batchDocument('JOB_STATE_PENDING', inputUri, outputUri, batchMetadata, job.name),
    )
  } catch (err) {
    const rejectedBeforeAcceptance =
      err instanceof GoogleBatchApiError &&
      err.status >= 400 &&
      err.status < 500 &&
      err.status !== 408
    let canReleaseLocks = !submissionStarted || rejectedBeforeAcceptance
    if (submittedJobName) {
      try {
        await stopVertexBatch(submittedJobName)
        // Cancellation is asynchronous: preserve polling and locks until the provider is terminal.
        await markBatchSubmittedForPolling(
          batchId,
          submittedJobName,
          batchDocument(
            'JOB_STATE_CANCELLING',
            inputUri,
            outputUri,
            batchMetadata,
            submittedJobName,
          ),
        )
      } catch (err_) {
        onError(err_ instanceof Error ? err_ : new Error(String(err_)))
        await markBatchSubmittedForPolling(
          batchId,
          submittedJobName,
          batchDocument(
            'JOB_STATE_PENDING',
            inputUri,
            outputUri,
            batchMetadata,
            submittedJobName,
            new Date().toISOString(),
          ),
        ).catch(onError)
      }
      canReleaseLocks = false
    }
    if (canReleaseLocks && batchPersisted) {
      await cleanupBatchLocks(batchId).catch(onError)
      await write('/* createBatch:cleanup */ DELETE FROM gemini_embedding_batches WHERE id = $1', [
        batchId,
      ]).catch(onError)
    }
    throw err
  } finally {
    await unlink(filePath).catch(onError)
    await unlink(entityIdsFilePath).catch(onError)
  }
  return batchId
}
