import { beforePostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'

/** Intercepts the real bounded transaction's initial source result, without changing its rows. */
export async function afterCopyrightAccountClockSource<Result>(
  accountUserId: string,
  operation: () => Promise<Result>,
  effect: () => Promise<void>,
): Promise<Result> {
  let applied = false
  const { result } = await observeTestPostgresClientQueries(operation, async query => {
    if (
      !applied &&
      query.text.includes('readCopyrightAccountClockSyncSource') &&
      query.values.includes(accountUserId)
    ) {
      applied = true
      await effect()
    }
  })
  return result
}

/** Starts a real release while sync owns its terminal identity acknowledgement write. */
export async function releaseAfterCopyrightAccountClockAcknowledgement<Result>(
  accountUserId: string,
  operation: () => Promise<Result>,
  release: () => Promise<unknown>,
): Promise<Result> {
  let pending: Promise<unknown> | undefined
  let applied = false
  try {
    const { result } = await observeTestPostgresClientQueries(operation, async query => {
      if (
        !applied &&
        query.text.includes('completeCopyrightAccountClockSync') &&
        query.values.includes(accountUserId)
      ) {
        applied = true
        const started = Promise.withResolvers<void>()
        const restore = beforePostgresTransactionQueryForTest(
          'releaseUserPreservationHold',
          values => values.includes(accountUserId),
          async () => {
            started.resolve()
          },
        )
        try {
          pending = release()
          await Promise.race([started.promise, pending])
        } finally {
          restore()
        }
      }
    })
    await pending
    return result
  } finally {
    await pending
  }
}
