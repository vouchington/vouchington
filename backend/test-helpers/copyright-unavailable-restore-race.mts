import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

/** Both restoration actors reach the real placement transition lock before either proceeds. */
export async function raceCopyrightPlacementRestores<Result>(
  placementId: string,
  actions: [() => Promise<Result>, () => Promise<Result>],
): Promise<PromiseSettledResult<Result>[]> {
  const release = Promise.withResolvers<void>()
  let arrived = 0
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, receiver, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          if (
            text.includes('/* lockCopyrightPlacementTransitions */') &&
            values.some(value => Array.isArray(value) && value.includes(placementId))
          ) {
            arrived += 1
            if (arrived === 2) release.resolve()
            await release.promise
          }
          return Reflect.apply(target, receiver, args)
        },
      }),
  )
  const pending = actions.map(action => action())
  // A failed/early action releases its peer instead of leaving an orphaned barrier.
  for (const action of pending) void action.finally(() => release.resolve()).catch(() => undefined)
  try {
    return await Promise.allSettled(pending)
  } finally {
    release.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
