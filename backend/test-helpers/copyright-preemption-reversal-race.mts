import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Resolve the filing while the losing worker retains its existing placement publication guard. */
export async function raceCopyrightRepairWithReversal<Original, Newer>(input: {
  phase: 'before_write' | 'after_write'
  placementId: string
  recordId: () => string
  beforeCompletion: () => Promise<void>
  original: () => Promise<Original>
  resolveFiling: () => Promise<void>
  newer: () => Promise<Newer>
}): Promise<[PromiseSettledResult<Original>, PromiseSettledResult<Newer>]> {
  const atRepair = Promise.withResolvers<number>()
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
          const selected =
            !paused &&
            text.includes('/* reconcileUnauthorizedMediaDeliveryRecord:deny */') &&
            values.includes(input.recordId())
          if (selected) paused = true
          if (selected && input.phase === 'before_write') {
            atRepair.resolve(await getTestPostgresBackendProcessId(target))
            await resume.promise
          }
          const result = await Reflect.apply(target, thisArgument, args)
          if (selected && input.phase === 'after_write') {
            atRepair.resolve(await getTestPostgresBackendProcessId(target))
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
    const holderProcessId = await Promise.race([
      atRepair.promise,
      original.then(() => {
        throw new Error('Current-authority repair was not reached')
      }),
    ])
    await input.resolveFiling()
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock:
          input.phase === 'before_write'
            ? { kind: 'advisory', key: `image-placement:${input.placementId}` }
            : { kind: 'transaction' },
        queryMarker:
          input.phase === 'before_write'
            ? 'lockImageDeliveryMutation:advisory'
            : 'stageImagePlacementDeliveryRecords',
        releaseHolder: async () => {
          resume.resolve()
          await originalSettled
        },
      },
      async waitForLock => {
        const newer = input.newer()
        pending.push(newer)
        const newerSettled = Promise.allSettled([newer])
        await waitForLock(newer)
        resume.resolve()
        const [[oldOutcome], [newOutcome]] = await Promise.all([originalSettled, newerSettled])
        return [oldOutcome!, newOutcome!]
      },
    )
  } finally {
    resume.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
