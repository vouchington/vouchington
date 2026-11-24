import { placeUserPreservationHold } from '../services/users/preservation-holds.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'

/** Run the owned DELETE with the real hold insert pending, then commit the hold first. */
export async function runRetentionWithPendingHoldForTest(
  admin: PrivateUser,
  accountId: string,
  deleteMarker: string,
  retainedId: string,
  cleanup: () => Promise<unknown>,
) {
  const inserted = Promise.withResolvers<void>()
  const allowHoldCommit = Promise.withResolvers<void>()
  const restoreHold = afterPostgresTransactionQueryForTest(
    '/* placeUserPreservationHold */',
    values => values.includes(accountId),
    async () => {
      inserted.resolve()
      await allowHoldCommit.promise
    },
  )
  const hold = placeUserPreservationHold(admin, accountId, 'matter-retention-race')
  try {
    try {
      await Promise.race([
        inserted.promise,
        hold.then(() => {
          throw new Error('Hold placement finished before reaching the race hook')
        }),
      ])
    } finally {
      restoreHold()
    }
    let reachedDelete = false
    const restoreDelete = afterPostgresTransactionQueryForTest(
      deleteMarker,
      values => values.some(value => Array.isArray(value) && value.includes(retainedId)),
      async () => {
        reachedDelete = true
        allowHoldCommit.resolve()
        await hold
      },
    )
    try {
      await cleanup()
      if (!reachedDelete) throw new Error('Retention did not attempt the owned row')
    } finally {
      restoreDelete()
    }
    return await hold
  } finally {
    allowHoldCommit.resolve()
    await hold.catch(() => {})
  }
}
