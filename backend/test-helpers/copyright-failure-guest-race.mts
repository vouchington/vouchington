import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Observe failure's actual work write waiting on admission's written blocker generation. */
export async function raceCopyrightFailureWithGuestFiling<Failure, Filing>(input: {
  noticeId: string
  failure: () => Promise<Failure>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Failure>, PromiseSettledResult<Filing>]> {
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
          if (
            !paused &&
            text.includes('/* preemptCopyrightRestorations */') &&
            values.includes(input.noticeId)
          ) {
            paused = true
            filingReady.resolve(await getTestPostgresBackendProcessId(target))
            await resumeFiling.promise
          }
          return Reflect.apply(target, thisArgument, args)
        },
      }),
  )
  try {
    const filing = input.filing()
    pending.push(filing)
    const filingSettled = Promise.allSettled([filing])
    const holderProcessId = await Promise.race([
      filingReady.promise,
      filing.then(() => {
        throw new Error('Guest preemption boundary was not reached')
      }),
    ])
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'Copyright',
        releaseHolder: async () => {
          resumeFiling.resolve()
          await filingSettled
        },
      },
      async waitForLock => {
        const failure = input.failure()
        pending.push(failure)
        const failureSettled = Promise.allSettled([failure])
        await waitForLock(failure)
        resumeFiling.resolve()
        const [[failureOutcome], [filingOutcome]] = await Promise.all([
          failureSettled,
          filingSettled,
        ])
        return [failureOutcome!, filingOutcome!]
      },
    )
  } finally {
    resumeFiling.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
