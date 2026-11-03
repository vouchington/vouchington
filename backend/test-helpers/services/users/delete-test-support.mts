import type { PrivateUser } from '../../../services/users/types.mts'
import { deleteUser } from '../../../services/users/delete.mts'
import {
  processUserDeletionBatch,
  type UserDeletionAttempt,
} from '../../../services/user-deletions/index.mts'
import { processUserDeletionPhaseBatch } from '../../../services/users/delete-phases.mts'

export async function deleteUserAndDrainForTest(
  currentUser: PrivateUser | null,
  user: PrivateUser,
): Promise<void> {
  await drainUserDeletionForTest(await deleteUser(currentUser, user))
}

export async function drainUserDeletionForTest(initialAttempt: UserDeletionAttempt): Promise<void> {
  let attempt: UserDeletionAttempt | null = initialAttempt
  for (let delivery = 0; attempt && delivery < 10_000; delivery++) {
    const current = attempt
    // Each successor token exists only after its batch commits.
    attempt = await processUserDeletionBatch(current.requestId, current.processingAttemptId, {
      processPhaseBatch: processUserDeletionPhaseBatch,
    })
  }
  if (attempt) throw new Error('User deletion test drain exceeded 10,000 deliveries')
}
