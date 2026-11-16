import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Reactivate through the actual profile writer while filing owns its real withholding write. */
export async function raceCopyrightFilingWithReactivation<Filing, Activation>(input: {
  noticeId: string
  filing: () => Promise<Filing>
  reactivate: () => Promise<Activation>
}): Promise<[PromiseSettledResult<Filing>, PromiseSettledResult<Activation>]> {
  const filingReady = Promise.withResolvers<number>()
  const resumeFiling = Promise.withResolvers<void>()
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
          const result = await Reflect.apply(target, thisArgument, args)
          if (
            !paused &&
            text.includes('/* denyCopyrightCourtFilingPlacements:tuples */') &&
            values.includes(input.noticeId)
          ) {
            paused = true
            filingReady.resolve(await getTestPostgresBackendProcessId(target))
            await resumeFiling.promise
          }
          return result
        },
      }),
  )
  try {
    const filing = input.filing()
    pending.push(filing)
    const filingSettled = Promise.allSettled([filing])
    const holderProcessId = await Promise.race([
      filingReady.promise,
      filingSettled.then(([result]) => {
        if (result?.status === 'rejected') throw result.reason
        throw new Error('Filing exited before retaining its withholding mutation')
      }),
    ])
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'syncImageSurfacePlacement:existing',
        releaseHolder: async () => {
          resumeFiling.resolve()
          await filingSettled
        },
      },
      async waitForLock => {
        const activation = input.reactivate()
        pending.push(activation)
        const activationSettled = Promise.allSettled([activation])
        await waitForLock(activation)
        resumeFiling.resolve()
        const [[filingOutcome], [activationOutcome]] = await Promise.all([
          filingSettled,
          activationSettled,
        ])
        return [filingOutcome!, activationOutcome!]
      },
    )
  } finally {
    resumeFiling.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
