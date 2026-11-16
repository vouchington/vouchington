import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

/** Preserve business ordering around the actual repair write and the newer restoration. */
export async function raceCopyrightRepairWithReversal<Original, Newer>(input: {
  phase: 'before_write' | 'after_write'
  placementId: string
  recordId: () => string
  beforeCompletion: () => Promise<void>
  original: () => Promise<Original>
  resolveFiling: () => Promise<void>
  newer: () => Promise<Newer>
  newerIntentId: () => string
}): Promise<[PromiseSettledResult<Original>, PromiseSettledResult<Newer>]> {
  const atRepair = Promise.withResolvers<void>()
  const newerStarted = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  let paused = false
  let filed = false
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          if (
            !filed &&
            input.recordId() &&
            text.includes('/* readCopyrightActionDeliveryForCompletion */')
          ) {
            filed = true
            await input.beforeCompletion()
          }
          if (
            text.includes('/* renewCopyrightActionIntentLease */') &&
            values.includes(input.newerIntentId())
          )
            newerStarted.resolve()
          const selected =
            !paused &&
            text.includes('/* reconcileUnauthorizedMediaDeliveryRecord:deny */') &&
            values.includes(input.recordId())
          if (selected) paused = true
          if (selected && input.phase === 'before_write') {
            atRepair.resolve()
            await resume.promise
          }
          const result = await Reflect.apply(target, thisArgument, args)
          if (selected && input.phase === 'after_write') {
            atRepair.resolve()
            await resume.promise
          }
          return result
        },
      }),
  )
  try {
    const original = input.original()
    pending.push(original)
    const originalSettled = Promise.allSettled([original])
    await Promise.race([
      atRepair.promise,
      originalSettled.then(([outcome]) => {
        if (outcome?.status === 'rejected') throw outcome.reason
        throw new Error('Current-authority repair was not reached')
      }),
    ])
    await input.resolveFiling()
    const newer = input.newer()
    pending.push(newer)
    const newerSettled = Promise.allSettled([newer])
    await Promise.race([
      newerStarted.promise,
      newerSettled.then(([outcome]) => {
        if (outcome?.status === 'rejected') throw outcome.reason
        throw new Error('New restoration exited before its actual renewal query')
      }),
    ])
    resume.resolve()
    const [[oldOutcome], [newOutcome]] = await Promise.all([originalSettled, newerSettled])
    return [oldOutcome!, newOutcome!]
  } finally {
    resume.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
