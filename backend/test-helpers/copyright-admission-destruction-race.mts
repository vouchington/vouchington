import { vi } from 'vitest'
import { psql, type QueryExecutor } from '@data-stores/psql'
import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'

/** Admission commits before the overlapping destroyer's first business read establishes its view. */
export async function runCopyrightAdmissionWinsDestructionRace<Admission, Destruction>(input: {
  admissionMarker: string
  admissionBinding: string
  destructionMarker: string
  admit: () => Promise<Admission>
  destroy: () => Promise<Destruction>
}): Promise<{ admitted: Admission; destroyed: Destruction }> {
  let destruction: Promise<Destruction> | undefined
  let paused = false
  const ready = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const realBegin = psql.beginBoundedTransaction
  const bounded = vi.spyOn(psql, 'beginBoundedTransaction').mockImplementation(async options => {
    const transaction = await realBegin(options)
    return new Proxy(transaction, {
      async apply(target, receiver, args: Parameters<QueryExecutor>) {
        const [statement, parameters] = args
        const text = typeof statement === 'string' ? statement : statement.text
        const values = typeof statement === 'string' ? (parameters ?? []) : statement.values
        if (
          !paused &&
          text.includes(input.destructionMarker) &&
          values.flat().includes(input.admissionBinding)
        ) {
          paused = true
          ready.resolve()
          await release.promise
        }
        return Reflect.apply(target, receiver, args)
      },
    })
  })
  const restore = afterPostgresTransactionQueryForTest(
    input.admissionMarker,
    values => values.flat().includes(input.admissionBinding),
    async () => {
      destruction = input.destroy()
      void destruction
        .then(() => ready.reject(new Error('Destroyer exited before its first read')))
        .catch(ready.reject)
      await ready.promise
    },
  )
  try {
    const admitted = await input.admit()
    release.resolve()
    if (!destruction) throw new Error('Admission did not reach its owned write')
    return { admitted, destroyed: await destruction }
  } finally {
    release.resolve()
    restore()
    bounded.mockRestore()
    await Promise.allSettled(destruction ? [destruction] : [])
  }
}
