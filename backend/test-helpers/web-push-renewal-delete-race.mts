import type { QueryExecutor, QueryOptions } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { createTestPostgresLockWaiter } from './postgres-lock-waiter.mts'

/** Pause renewal after retiring its old subscription until deletion really waits on that write. */
export async function runTestWebPushRenewalDeleteRace<Result>(input: {
  userId: string
  deleteMarker: string
  renew: () => Promise<Result>
  remove: (options: QueryOptions) => Promise<unknown>
}): Promise<Result> {
  let waiter: Awaited<ReturnType<typeof createTestPostgresLockWaiter>> | undefined
  let deletion: Promise<unknown> | undefined
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
          const result = await Reflect.apply(target, thisArgument, argumentsList)
          const [statement] = argumentsList
          const text = typeof statement === 'string' ? statement : statement.text
          if (text.includes('/* releaseWebPushEndpointOwner */')) {
            waiter = await createTestPostgresLockWaiter({
              holder: transaction,
              lock: { kind: 'transaction' },
              selected: { marker: input.deleteMarker, binding: { index: 0, value: input.userId } },
            })
            const ownedWaiter = waiter
            deletion = input.remove({ query: ownedWaiter.query }).then(async value => {
              await ownedWaiter.query.commit()
              return value
            })
            await ownedWaiter.waitForLock(deletion)
          }
          return result
        },
      }),
    true,
  )
  try {
    const renewed = await input.renew()
    if (!deletion) throw new Error('Web Push renewal did not reach its subscription retirement')
    await deletion
    return renewed
  } finally {
    restore()
    await waiter?.[Symbol.asyncDispose]()
  }
}
