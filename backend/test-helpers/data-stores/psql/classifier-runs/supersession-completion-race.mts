import { afterPostgresTransactionQueryForTest } from '../../../injected-postgres-transactions.mts'
import { withTestOwnedPostgresWait } from '../../../postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from '../../../postgres-lock-wait.mts'

/** Complete a run while its supersession waits to mark the same receipt. */
export async function raceClassifierSupersessionWithCompletion<Completion, Supersession>(input: {
  runId: string
  complete: () => Promise<Completion>
  makeCurrentUnavailable: () => Promise<void>
  supersede: () => Promise<Supersession>
}): Promise<[Completion, Supersession]> {
  const completionHolding = Promise.withResolvers<number>()
  const releaseCompletion = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  const restore = afterPostgresTransactionQueryForTest(
    '/* lockClassifierRun */',
    values => values.includes(input.runId),
    async transaction => {
      completionHolding.resolve(await getTestPostgresBackendProcessId(transaction))
      await releaseCompletion.promise
    },
  )
  try {
    const completion = input.complete()
    pending.push(completion)
    const completionSettled = Promise.allSettled([completion])
    const holderProcessId = await Promise.race([
      completionHolding.promise,
      completionSettled.then(([result]) => {
        if (result?.status === 'rejected') throw result.reason
        throw new Error('Completion exited before locking its run')
      }),
    ])
    await input.makeCurrentUnavailable()
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'supersedeStaleClassifierRun.mark',
        releaseHolder: async () => {
          releaseCompletion.resolve()
          await completionSettled
        },
      },
      async waitForLock => {
        const supersession = input.supersede()
        pending.push(supersession)
        await waitForLock(supersession)
        releaseCompletion.resolve()
        return Promise.all([completion, supersession])
      },
    )
  } finally {
    releaseCompletion.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
