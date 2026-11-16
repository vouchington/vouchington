import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Pause renewal after retiring its old subscription until default-pool deletion really waits. */
export async function runTestWebPushRenewalDeleteRace<Result>(input: {
  userId: string
  deleteMarker: string
  renew: () => Promise<Result>
  remove: () => Promise<unknown>
}): Promise<Result> {
  let deletion: Promise<unknown> | undefined
  const observed = Promise.withResolvers<void>()
  const restore = afterPostgresTransactionQueryForTest(
    '/* releaseWebPushEndpointOwner */',
    values => values.includes(input.userId),
    async query => {
      const holderProcessId = await getTestPostgresBackendProcessId(query)
      deletion = withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: input.deleteMarker,
          // Renewal's await-using owner releases its transaction on either outcome.
          releaseHolder: async () => {},
        },
        async waitForLock => {
          const pending = input.remove()
          await waitForLock(pending)
          observed.resolve()
          return pending
        },
      )
      void deletion.catch((err: unknown) => observed.reject(err))
      await observed.promise
    },
  )
  try {
    const renewed = await input.renew()
    if (!deletion) throw new Error('Web Push renewal did not reach its subscription retirement')
    await deletion
    return renewed
  } finally {
    restore()
    await Promise.allSettled(deletion ? [deletion] : [])
  }
}
