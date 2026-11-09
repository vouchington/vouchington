import type { TransactionQuery } from '@data-stores/psql/types'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Witness the real statement waiting on this fixture's actual writer transaction, then commit it. */
export async function withTestImageWriterLockWait<Result>(
  holder: TransactionQuery & AsyncDisposable & { commit(): Promise<void> },
  queryMarker: string,
  operation: () => Promise<Result>,
  onBlocked?: () => void,
): Promise<Result> {
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      onBlocked?.()
      await holder.commit()
      return pending
    },
  )
}
