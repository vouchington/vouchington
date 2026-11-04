import {
  enqueueOrReactivateBulkUserDeletions,
  enqueueUserDeletion,
} from '@queues/account-lifecycle/enqueues/user-deletions'
import { claimRecoverableUserDeletions, processUserDeletionBatch } from '@services/user-deletions'
import { processUserDeletionPhaseBatch } from '@services/users/delete-phases'

export async function processUserDeletion(
  requestId: string,
  processingAttemptId: string,
  options: { isFinalAttempt: boolean },
): Promise<void> {
  const next = await processUserDeletionBatch(
    requestId,
    processingAttemptId,
    { processPhaseBatch: processUserDeletionPhaseBatch },
    options,
  )
  if (next) await enqueueUserDeletion(next)
}

export async function recoverUserDeletions(
  requestIds?: readonly string[],
  batchSize?: number,
): Promise<{ enqueued: number }> {
  const requests = await claimRecoverableUserDeletions(requestIds, batchSize)
  if (requests.length > 0) await enqueueOrReactivateBulkUserDeletions(requests)
  return { enqueued: requests.length }
}
