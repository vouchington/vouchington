import { enqueueBulkUserDeletions, enqueueUserDeletion } from '@queues/user-deletions/enqueues'
import { claimRecoverableUserDeletions, processUserDeletionBatch } from '@services/user-deletions'
import { processUserDeletionPhaseBatch } from '@services/users/delete-phases'

type ProcessUserDeletionDependencies = {
  enqueueUserDeletion: typeof enqueueUserDeletion
  processUserDeletionBatch: typeof processUserDeletionBatch
}

type RecoverUserDeletionsDependencies = {
  claimRecoverableUserDeletions: typeof claimRecoverableUserDeletions
  enqueueBulkUserDeletions: typeof enqueueBulkUserDeletions
}

export async function processUserDeletion(
  requestId: string,
  processingAttemptId: string,
  options: { isFinalAttempt: boolean },
  dependencies?: Partial<ProcessUserDeletionDependencies>,
): Promise<void> {
  const processBatch = dependencies?.processUserDeletionBatch ?? processUserDeletionBatch
  const enqueue = dependencies?.enqueueUserDeletion ?? enqueueUserDeletion
  const next = await processBatch(
    requestId,
    processingAttemptId,
    { processPhaseBatch: processUserDeletionPhaseBatch },
    options,
  )
  if (next) await enqueue(next)
}

export async function recoverUserDeletions(
  dependencies?: Partial<RecoverUserDeletionsDependencies>,
): Promise<{ enqueued: number }> {
  const claim = dependencies?.claimRecoverableUserDeletions ?? claimRecoverableUserDeletions
  const enqueue = dependencies?.enqueueBulkUserDeletions ?? enqueueBulkUserDeletions
  const requests = await claim()
  if (requests.length > 0) await enqueue(requests)
  return { enqueued: requests.length }
}
