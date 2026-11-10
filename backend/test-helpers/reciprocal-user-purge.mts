import {
  retireTestUserImageOwners,
  writeTestImageOwnerRetirement,
} from './image-owner-retirement.mts'
import { beginTransaction } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import sql from 'sql-template-strings'

export async function holdTestFinalPurgeUserLifecycle(userId: string) {
  const transaction = await beginTransaction()
  try {
    await transaction(
      '/* holdTestFinalPurgeUserLifecycle */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [userId],
    )
    const holderProcessId = await getTestPostgresBackendProcessId(transaction)
    return {
      holderProcessId,
      commit: () => transaction.commit(),
      [Symbol.asyncDispose]: () => transaction[Symbol.asyncDispose](),
    }
  } catch (err) {
    await transaction[Symbol.asyncDispose]()
    throw err
  }
}

export async function setReciprocalTestUserDeletionActors(
  firstUserId: string,
  secondUserId: string,
  deletedAt: Date,
): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageOwnerRetirement(
    query,
    [{ userId: firstUserId }, { userId: secondUserId }],
    (references, scopeQuery) =>
      retireTestUserImageOwners(
        references,
        scopeQuery,
        sql`deleted_at = ${deletedAt}, deleted_by_id = CASE WHEN users.id = ${firstUserId}::uuid
        THEN ${secondUserId}::uuid ELSE ${firstUserId}::uuid END`,
        'setReciprocalTestUserDeletionActors',
      ),
  )
  await query.commit()
}
