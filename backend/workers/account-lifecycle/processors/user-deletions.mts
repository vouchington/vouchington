import {
  enqueueOrReactivateBulkUserDeletions,
  enqueueUserDeletion,
} from '@queues/account-lifecycle/enqueues/user-deletions'
import { claimRecoverableUserDeletions, processUserDeletionBatch } from '@services/user-deletions'
import { processUserDeletionPhaseBatch } from '@services/users/delete-phases'

type RecoverUserDeletionsDependencies = {
  claimRecoverableUserDeletions: typeof claimRecoverableUserDeletions
}

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
  dependencies?: Partial<RecoverUserDeletionsDependencies>,
): Promise<{ enqueued: number }> {
  const claim = dependencies?.claimRecoverableUserDeletions ?? claimRecoverableUserDeletions
  const requests = await claim()
  if (requests.length > 0) await enqueueOrReactivateBulkUserDeletions(requests)
  return { enqueued: requests.length }
}
