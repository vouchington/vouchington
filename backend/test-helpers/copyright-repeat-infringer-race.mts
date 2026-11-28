import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/**
 * Hold the first transaction open immediately after `openReview` runs until a second connection
 * queues behind it on `copyright_repeat_infringer_account_states`, then let both commit.
 */
export async function raceConcurrentRepeatInfringerOpenReviewsForTest<Result>(
  accountId: string,
  first: () => Promise<Result>,
  second: () => Promise<Result>,
): Promise<{ first: Result; second: Result }> {
  const firstReady = Promise.withResolvers<number>()
  const releaseFirst = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  let restore: (() => void) | undefined
  restore = afterPostgresTransactionQueryForTest(
    '/* syncCopyrightRepeatInfringerIncidents:openReview */',
    values => values.some(value => Array.isArray(value) && value.includes(accountId)),
    async transaction => {
      restore?.()
      restore = undefined
      firstReady.resolve(await getTestPostgresBackendProcessId(transaction))
      await releaseFirst.promise
    },
  )
  try {
    const firstPromise = first()
    pending.push(firstPromise)
    const firstSettled = Promise.allSettled([firstPromise])
    const holderProcessId = await Promise.race([
      firstReady.promise,
      firstSettled.then(([result]) => {
        if (result?.status === 'rejected') throw result.reason
        throw new Error('First sync did not execute openReview')
      }),
    ])
    const secondResult = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'syncCopyrightRepeatInfringerIncidents:openReview',
        releaseHolder: async () => {
          releaseFirst.resolve()
          await firstSettled
        },
      },
      async waitForLock => {
        const secondPromise = second()
        pending.push(secondPromise)
        const secondSettled = Promise.allSettled([secondPromise])
        await waitForLock(secondPromise)
        releaseFirst.resolve()
        const [outcome] = await secondSettled
        if (outcome.status === 'rejected') throw outcome.reason
        return outcome.value
      },
    )
    const [firstOutcome] = await firstSettled
    if (firstOutcome.status === 'rejected') throw firstOutcome.reason
    return { first: firstOutcome.value, second: secondResult }
  } finally {
    releaseFirst.resolve()
    restore?.()
    await Promise.allSettled(pending)
  }
}
