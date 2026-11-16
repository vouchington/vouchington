import { createHash } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

/** Both claims observe the same owned endpoint before either starts its subscription writes. */
export async function runTestWebPushClaimRace<Result>(
  endpoint: string,
  claims: readonly [() => Promise<Result>, () => Promise<Result>],
): Promise<PromiseSettledResult<Result>[]> {
  const digest = createHash('sha256').update(endpoint).digest('hex')
  const barrier = Promise.withResolvers<void>()
  let arrivals = 0
  const restore = interceptPostgresTransactionsForTest(transaction => {
    let arrived = false
    return new Proxy(transaction, {
      async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
        const result = await Reflect.apply(target, thisArgument, argumentsList)
        const [statement, parameters] = argumentsList
        const text = typeof statement === 'string' ? statement : statement.text
        const values = typeof statement === 'string' ? parameters : statement.values
        if (text.includes('/* getWebPushEndpointOwner */') && values?.[0] === digest) {
          if (arrived) throw new Error('Web Push claim repeated its ownership read')
          arrived = true
          arrivals++
          if (arrivals === 2) barrier.resolve()
          await barrier.promise
        }
        return result
      },
    })
  })
  try {
    const outcomes = await Promise.allSettled(
      claims.map(async claim => {
        try {
          return await claim()
        } catch (err) {
          barrier.resolve()
          throw err
        }
      }),
    )
    if (arrivals !== 2) throw new Error('Web Push claim race did not observe both ownership reads')
    return outcomes
  } finally {
    barrier.resolve()
    restore()
  }
}
