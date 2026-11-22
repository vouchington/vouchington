import { AsyncLocalStorage } from 'node:async_hooks'
import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Release both real service transactions only after each read its empty daily window. */
export async function runConcurrentFollowerDistributionsForTest<Result>(
  operation: () => Promise<Result>,
): Promise<PromiseSettledResult<Result>[]> {
  return runPoolObservationExclusively(async () => {
    const scope = new AsyncLocalStorage<object>()
    const token = {}
    const barrier = Promise.withResolvers<void>()
    const restorations = new Map<pg.PoolClient, () => void>()
    let arrivals = 0
    const observe = (client: pg.PoolClient) => {
      if (restorations.has(client)) return
      const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const original = client.query
      restorations.set(client, () => {
        if (descriptor) Object.defineProperty(client, 'query', descriptor)
        else Reflect.deleteProperty(client, 'query')
      })
      const query = new Proxy(original, {
        apply(target, receiver, args) {
          const input = args[0] as string | { text?: string }
          const text = typeof input === 'string' ? input : input?.text
          const pending = Reflect.apply(target, receiver, args)
          if (
            scope.getStore() !== token ||
            !text?.trimStart().startsWith('/* assertCanDistribute */')
          )
            return pending
          return Promise.resolve(pending as Promise<pg.QueryResult<{ has_recent: boolean }>>).then(
            async result => {
              if (!result.rows[0] || result.rows[0].has_recent)
                throw new Error('Concurrent distribution fixture expected an empty daily window')
              arrivals += 1
              if (arrivals === 2) barrier.resolve()
              await barrier.promise
              return result
            },
          )
        },
      })
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    async function runOne(): Promise<Result> {
      try {
        return await scope.run(token, operation)
      } finally {
        barrier.resolve()
      }
    }
    try {
      const outcomes = await Promise.allSettled([runOne(), runOne()])
      if (arrivals !== 2)
        throw new AggregateError(
          outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [outcome.reason] : [])),
          `Both distribution transactions must read before writing; observed ${arrivals}`,
        )
      return outcomes
    } finally {
      barrier.resolve()
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
