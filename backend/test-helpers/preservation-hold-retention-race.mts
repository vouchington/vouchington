import { placeUserPreservationHold } from '../services/users/preservation-holds.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Pause production hold placement with its account locked, then commit the hold first. */
export async function runRetentionWithPendingHoldForTest(
  admin: PrivateUser,
  accountId: string,
  deleteMarker: string,
  retainedId: string,
  cleanup: () => Promise<unknown>,
) {
  const accountLocked = Promise.withResolvers<number>()
  const allowHoldCommit = Promise.withResolvers<void>()
  const restoreHold = afterPostgresTransactionQueryForTest(
    '/* lockPreservationHoldUser:userExists */',
    values => values.includes(accountId),
    async query => {
      // Pause before the hold insert acquires the shared preservation generation.
      accountLocked.resolve(await getTestPostgresBackendProcessId(query))
      await allowHoldCommit.promise
    },
  )
  const hold = placeUserPreservationHold(admin, accountId, 'matter-retention-race')
  try {
    const holderProcessId = await (async () => {
      try {
        return await Promise.race([
          accountLocked.promise,
          hold.then(() => {
            throw new Error('Hold placement finished before reaching the race hook')
          }),
        ])
      } finally {
        restoreHold()
      }
    })()
    let deletedBeforeHoldCommit = false
    let committingHold = false
    const restoreDelete = afterPostgresTransactionQueryForTest(
      deleteMarker,
      values => values.some(value => Array.isArray(value) && value.includes(retainedId)),
      async () => {
        deletedBeforeHoldCommit = !committingHold
        allowHoldCommit.resolve()
        await hold
      },
    )
    let retention: Promise<unknown> | undefined
    try {
      await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'lockRetentionPreservationAccounts',
          releaseHolder: async () => allowHoldCommit.resolve(),
        },
        async waitForLock => {
          retention = cleanup()
          await waitForLock(retention)
          committingHold = true
          allowHoldCommit.resolve()
          await retention
        },
      )
    } catch (err) {
      // On main there is no wait. Let the owned DELETE finish, then assert its committed outcome.
      if (
        !deletedBeforeHoldCommit ||
        !(err instanceof Error) ||
        err.message !== 'Owned action settled without its native lock wait'
      )
        throw err
      await retention
    } finally {
      restoreDelete()
    }
    return await hold
  } finally {
    allowHoldCommit.resolve()
    await hold.catch(() => {})
  }
}
