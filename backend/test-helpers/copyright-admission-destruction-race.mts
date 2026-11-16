import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Commit admission only after the real destroyer has reached its conflicting PostgreSQL lock. */
export async function runCopyrightAdmissionWinsDestructionRace<Admission, Destruction>(input: {
  admissionMarker: string
  admissionBinding: string
  destructionMarker: string
  admit: () => Promise<Admission>
  destroy: () => Promise<Destruction>
}): Promise<{ admitted: Admission; destroyed: Destruction }> {
  let destruction: Promise<Destruction> | undefined
  const observed = Promise.withResolvers<void>()
  const restore = afterPostgresTransactionQueryForTest(
    input.admissionMarker,
    values => values.flat().includes(input.admissionBinding),
    async query => {
      const holderProcessId = await getTestPostgresBackendProcessId(query)
      destruction = withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: input.destructionMarker,
          // The admission's await-using owner releases its transaction on either outcome.
          releaseHolder: async () => {},
        },
        async waitForLock => {
          const pending = input.destroy()
          await waitForLock(pending)
          observed.resolve()
          return pending
        },
      )
      void destruction.catch((err: unknown) => {
        observed.reject(err)
      })
      await observed.promise
    },
  )
  try {
    const admitted = await input.admit()
    if (!destruction) throw new Error('Admission did not reach its owned write')
    return { admitted, destroyed: await destruction }
  } finally {
    restore()
    await Promise.allSettled(destruction ? [destruction] : [])
  }
}
