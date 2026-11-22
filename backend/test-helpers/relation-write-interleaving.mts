import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

export async function commitRelationWriteDuringCompetingMutationForTest<T>(
  write: (query: TransactionQuery) => Promise<unknown>,
  queryMarker: string,
  compete: () => Promise<T>,
): Promise<T> {
  await using holder = await beginTransaction()
  await write(holder)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const competing = compete()
      await waitForLock(competing)
      await holder.commit()
      return competing
    },
  )
}
