import type { PrivateUser } from './types.mts'
import { deleteUser } from './delete.mts'
import { processUserDeletionBatch, type UserDeletionAttempt } from '@services/user-deletions'
import { processUserDeletionExternalWork, processUserDeletionPhaseBatch } from './delete-phases.mts'

type DrainUserDeletionDependencies = {
  deleteExportsFromS3?: (s3Keys: string[]) => Promise<unknown>
  sanitizeStripeCustomer?: (stripeCustomerId: string) => Promise<unknown>
}

export async function deleteUserAndDrainForTest(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  dependencies: DrainUserDeletionDependencies = {},
): Promise<void> {
  await drainUserDeletionForTest(await deleteUser(currentUser, user), dependencies)
}

export async function drainUserDeletionForTest(
  initialAttempt: UserDeletionAttempt,
  dependencies: DrainUserDeletionDependencies = {},
): Promise<void> {
  let attempt: UserDeletionAttempt | null = initialAttempt
  for (let delivery = 0; attempt && delivery < 10_000; delivery++) {
    const current = attempt
    // oxlint-disable-next-line no-await-in-loop -- each successor token exists only after its batch commits.
    attempt = await processUserDeletionBatch(current.requestId, current.processingAttemptId, {
      processPhaseBatch: input =>
        input.phase === 'external-work'
          ? processUserDeletionExternalWork(input.requestId, input.processingAttemptId, {
              deleteExportFromS3: key =>
                dependencies.deleteExportsFromS3?.([key]).then(() => undefined) ??
                Promise.resolve(),
              purgeCacheTags: async () => undefined,
              sanitizeStripeCustomer: id =>
                dependencies.sanitizeStripeCustomer?.(id).then(() => undefined) ??
                Promise.resolve(),
            })
          : processUserDeletionPhaseBatch(input),
    })
  }
  if (attempt) throw new Error('User deletion test drain exceeded 10,000 deliveries')
}
