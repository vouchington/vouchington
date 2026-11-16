import { onTestFinished } from 'vitest'
import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { runTestCopyrightRenewalBoundary } from './copyright-denial-renewal-boundary.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Observe a real guest write waiting on completion's actual lifecycle transaction. */
export async function raceCopyrightCompletionWithGuestFiling<Action, Filing>(input: {
  intentId: string
  noticeId: string
  action: () => Promise<Action>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Action>, PromiseSettledResult<Filing>]> {
  const atCompletion = Promise.withResolvers<number>()
  const resume = Promise.withResolvers<void>()
  let paused = false
  const pending: Promise<unknown>[] = []
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          const completed = await Reflect.apply(target, thisArgument, args)
          if (
            !paused &&
            text.includes('/* processCopyrightActionIntent:event */') &&
            values.includes(input.intentId) &&
            values.includes('placement_restored')
          ) {
            paused = true
            atCompletion.resolve(await getTestPostgresBackendProcessId(target))
            await resume.promise
          }
          return completed
        },
      }),
  )
  try {
    const action = input.action()
    pending.push(action)
    const actionSettled = Promise.allSettled([action])
    const processId = await Promise.race([
      atCompletion.promise,
      action.then(() => {
        throw new Error('Completion event was not reached')
      }),
    ])
    return await withTestOwnedPostgresWait(
      {
        holderProcessId: processId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'Copyright',
        releaseHolder: async () => {
          resume.resolve()
          await actionSettled
        },
      },
      async waitForLock => {
        const filing = input.filing()
        pending.push(filing)
        const filingSettled = Promise.allSettled([filing])
        await waitForLock(filing)
        resume.resolve()
        const [[actionOutcome], [filingOutcome]] = await Promise.all([actionSettled, filingSettled])
        return [actionOutcome!, filingOutcome!]
      },
    )
  } finally {
    resume.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}

/** Start finalization inside the native observer while the filing owns its actual writes. */
export async function raceCopyrightFinalizationWithGuestFiling<Action, Filing>(input: {
  noticeId: string
  boundary: 'denial' | 'completion'
  action: () => Promise<Action>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Action>, PromiseSettledResult<Filing>]> {
  const atFiling = Promise.withResolvers<number>()
  const renewalReached = Promise.withResolvers<void>()
  const resumeFiling = Promise.withResolvers<void>()
  let filingProcessId: number | undefined
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
            input.boundary === 'denial' &&
            text.includes('/* renewCopyrightActionIntentLease */')
          ) {
            renewalReached.resolve()
            if (filingProcessId === undefined) throw new Error('Filing holder was not captured')
            return runTestCopyrightRenewalBoundary(target, args, filingProcessId, () =>
              resumeFiling.resolve(),
            )
          }
          const result = await Reflect.apply(target, thisArgument, args)
          if (
            !paused &&
            text.includes(
              input.boundary === 'denial'
                ? '/* appendCopyrightGuestFiling:event */'
                : '/* appendCopyrightGuestFiling */',
            ) &&
            values.includes(input.noticeId)
          ) {
            paused = true
            atFiling.resolve(await getTestPostgresBackendProcessId(target))
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
      atFiling.promise,
      filing.then(() => {
        throw new Error('Guest filing write was not reached')
      }),
    ])
    filingProcessId = holderProcessId
    if (input.boundary === 'denial') {
      onTestFinished(() => resumeFiling.resolve())
      const action = input.action()
      pending.push(action)
      const actionSettled = Promise.allSettled([action])
      await Promise.race([
        renewalReached.promise,
        actionSettled.then(() => {
          throw new Error('Copyright finalization settled before its lease-renewal boundary')
        }),
      ])
      const [[actionOutcome], [filingOutcome]] = await Promise.all([actionSettled, filingSettled])
      return [actionOutcome!, filingOutcome!]
    }
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'processCopyrightActionIntent:event',
        releaseHolder: async () => {
          resumeFiling.resolve()
          await filingSettled
        },
      },
      async waitForLock => {
        const action = input.action()
        pending.push(action)
        const actionSettled = Promise.allSettled([action])
        await waitForLock(action)
        resumeFiling.resolve()
        const [[actionOutcome], [filingOutcome]] = await Promise.all([actionSettled, filingSettled])
        return [actionOutcome!, filingOutcome!]
      },
    )
  } finally {
    resumeFiling.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
