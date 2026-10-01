import { beginTransaction, write } from '@data-stores/psql'
import { FINAL_USER_PURGE_LOCK_KEY } from '../services/data-retention/cleanup-soft-deleted-user.mts'
import {
  getTestPostgresAdvisoryLockHolderProcessId,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

export async function setReciprocalTestUserDeletionActors(
  firstUserId: string,
  secondUserId: string,
  deletedAt: Date,
): Promise<void> {
  await write(
    `/* setReciprocalTestUserDeletionActors */
    UPDATE users SET deleted_at = $3,
      deleted_by_id = CASE WHEN id = $1::uuid THEN $2::uuid ELSE $1::uuid END
    WHERE id IN ($1::uuid, $2::uuid)`,
    [firstUserId, secondUserId, deletedAt],
  )
}

export async function holdTestFinalPurgeUserLifecycle(userId: string) {
  const transaction = await beginTransaction()
  try {
    await transaction(
      `/* holdTestFinalPurgeUserLifecycle */
      SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [userId],
    )
    const holderProcessId = await getTestPostgresBackendProcessId(transaction)
    return {
      async waitForFirstPurge() {
        await waitForTestPostgresLockWaiter(holderProcessId, 'cleanupSoftDeletedUserBatch:lockUser')
        return getTestPostgresAdvisoryLockHolderProcessId({ key: FINAL_USER_PURGE_LOCK_KEY })
      },
      async waitForSerializedPurge(firstPurgeProcessId: number) {
        await waitForTestPostgresLockWaiter(
          firstPurgeProcessId,
          'cleanupSoftDeletedUserBatch:serializeFinalPurges',
        )
      },
      async [Symbol.asyncDispose]() {
        await transaction[Symbol.asyncDispose]()
      },
    }
  } catch (error) {
    await transaction[Symbol.asyncDispose]()
    throw error
  }
}
