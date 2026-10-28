import type { beginTransaction } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { getFirstTestHostnameOwnershipLockKey } from './hostname-ownership.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

export async function withApprovalHostnameWait<Result>(
  holder: Awaited<ReturnType<typeof beginTransaction>>,
  hostnameId: string,
  start: () => Promise<Result>,
): Promise<Result> {
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  const heldHostnameKey = await getFirstTestHostnameOwnershipLockKey(holder, hostnameId)
  return withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'advisory', key: heldHostnameKey },
      queryMarker: 'lockHostnameOwnership',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = start()
      await waitForLock(pending)
      await holder.commit()
      return pending
    },
  )
}
