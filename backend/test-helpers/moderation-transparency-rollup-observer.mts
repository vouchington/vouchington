import { writePool } from '@data-stores/psql'
import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Observe the real pg promise for one owned autocommit release before reading its rows. */
export function observeTestModerationTransparencyRollupRelease<Result>(
  cohort: {
    occurredAt: Date
    metric: FiniteValue<'moderation_transparency_metrics'>
    category: FiniteValue<'moderation_transparency_categories'>
  },
  release: () => Promise<Result>,
): { released: Promise<void>; result: Promise<Result> } {
  const released = Promise.withResolvers<void>()
  const day = cohort.occurredAt.toISOString().slice(0, 10)
  const result = runPoolObservationExclusively(async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(writePool, 'query')
    const observations: Promise<void>[] = []
    let observed = false
    const query = new Proxy(writePool.query, {
      apply(target, receiver, args: unknown[]) {
        const input = args[0]
        const text =
          typeof input === 'string'
            ? input
            : typeof input === 'object' && input !== null && 'text' in input
              ? input.text
              : undefined
        const values =
          typeof input === 'object' && input !== null && 'values' in input ? input.values : args[1]
        const owned =
          typeof text === 'string' &&
          text.includes('/* releaseModerationTransparencyCohort */') &&
          Array.isArray(values) &&
          values[0] === day &&
          values[1] === null &&
          values[2] === cohort.metric &&
          values[3] === cohort.category
        const actual: unknown = Reflect.apply(target, receiver, args)
        if (owned) {
          if (!(actual instanceof Promise)) {
            released.reject(new Error('Owned autocommit release did not return a pg promise'))
          } else {
            observations.push(
              actual.then(
                () => {
                  observed = true
                  released.resolve()
                  return undefined
                },
                (err: unknown) => released.reject(err),
              ),
            )
          }
        }
        return actual
      },
    })
    Object.defineProperty(writePool, 'query', {
      configurable: true,
      enumerable: originalDescriptor?.enumerable ?? false,
      writable: true,
      value: query,
    })
    const [outcome] = await Promise.allSettled([Promise.resolve().then(release)])
    await Promise.allSettled(observations)
    if (writePool.query !== query) {
      const err = new Error('Moderation release observer lost ownership of the pg query boundary')
      if (outcome.status === 'rejected')
        throw new AggregateError([outcome.reason, err], 'Release and observer cleanup failed', {
          cause: outcome.reason,
        })
      throw err
    }
    if (originalDescriptor) Object.defineProperty(writePool, 'query', originalDescriptor)
    else Reflect.deleteProperty(writePool, 'query')
    if (outcome.status === 'rejected') throw outcome.reason
    if (!observed) throw new Error('Owned moderation transparency cohort was not released')
    return outcome.value
  })
  void result.catch((err: unknown) => released.reject(err))
  return { released: released.promise, result }
}
