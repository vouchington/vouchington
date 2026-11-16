import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** The real qualifying hold owns its preempted work before reaching its placement mutation. */
export async function raceCopyrightCompensationWithLateHold<Compensation, Hold>(input: {
  placementId: string
  hold: () => Promise<Hold>
  compensate: () => Promise<Compensation>
}): Promise<[PromiseSettledResult<Compensation>, PromiseSettledResult<Hold>]> {
  const holdReady = Promise.withResolvers<number>()
  const resumeHold = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  let paused = false
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          if (
            !paused &&
            text.includes('/* lockImageDeliveryMutation:findBindings */') &&
            values.some(value => Array.isArray(value) && value.includes(input.placementId))
          ) {
            paused = true
            holdReady.resolve(await getTestPostgresBackendProcessId(target))
            await resumeHold.promise
          }
          return Reflect.apply(target, thisArgument, args)
        },
      }),
  )
  try {
    const hold = input.hold()
    pending.push(hold)
    const holdSettled = Promise.allSettled([hold])
    const holderProcessId = await Promise.race([
      holdReady.promise,
      hold.then(() => {
        throw new Error('Late hold placement boundary was not reached')
      }),
    ])
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'renewCopyrightActionIntentLease',
        releaseHolder: async () => {
          resumeHold.resolve()
          await holdSettled
        },
      },
      async waitForLock => {
        const compensation = input.compensate()
        pending.push(compensation)
        const compensationSettled = Promise.allSettled([compensation])
        await waitForLock(compensation)
        resumeHold.resolve()
        const [[compensationOutcome], [holdOutcome]] = await Promise.all([
          compensationSettled,
          holdSettled,
        ])
        return [compensationOutcome!, holdOutcome!]
      },
    )
  } finally {
    resumeHold.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
