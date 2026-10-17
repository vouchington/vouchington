import { write, type QueryExecutor } from '@data-stores/psql'

/** Commit a competing mutation after factor gathering, immediately before the real CAS write. */
export function createVoteWeightRecalculationRaceQuery(
  beforeCompareAndSet: () => Promise<void>,
): QueryExecutor {
  let intercepted = false
  return new Proxy(write, {
    async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      const [input] = argumentsList
      const statement = typeof input === 'string' ? input : input.text
      if (!intercepted && statement.includes('/* recalculateUserVoteWeight:apply */')) {
        intercepted = true
        await beforeCompareAndSet()
      }
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
}
