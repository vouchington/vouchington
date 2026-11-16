import { onTestFinished } from 'vitest'
import type { QueryExecutor } from '@data-stores/psql'
import {
  beforePostgresTransactionQueryForTest,
  interceptPostgresTransactionsForTest,
} from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
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

/** Race filing against completion, or the separately committed denial receipt. */
export async function raceCopyrightFinalizationWithGuestFiling<Action, Filing>(input: {
  noticeId: string
  intentId: string
  boundary: 'denial' | 'completion'
  action: () => Promise<Action>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Action>, PromiseSettledResult<Filing>]> {
  if (input.boundary === 'denial') return raceCopyrightDenialReceiptWithGuestFiling(input)
  const atFiling = Promise.withResolvers<number>()
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
            text.includes('/* appendCopyrightGuestFiling */') &&
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
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'lockCopyrightActionGenerationForWrite',
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

/** Admit the filing after denial commit and receipt facts, before the actual terminal CAS. */
async function raceCopyrightDenialReceiptWithGuestFiling<Action, Filing>(input: {
  intentId: string
  action: () => Promise<Action>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Action>, PromiseSettledResult<Filing>]> {
  const atReceipt = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  onTestFinished(() => release.resolve())
  const pending: Promise<unknown>[] = []
  const restore = beforePostgresTransactionQueryForTest(
    '/* completeCopyrightActionIntentInTransaction */',
    values => values.includes(input.intentId),
    async () => {
      atReceipt.resolve()
      await release.promise
    },
  )
  try {
    const action = input.action()
    pending.push(action)
    const actionSettled = Promise.allSettled([action])
    await Promise.race([
      atReceipt.promise,
      actionSettled.then(() => {
        throw new Error('Finalization settled before its denial receipt CAS')
      }),
    ])
    const filing = input.filing()
    pending.push(filing)
    const filingSettled = Promise.allSettled([filing])
    await filingSettled
    release.resolve()
    const [[actionOutcome], [filingOutcome]] = await Promise.all([actionSettled, filingSettled])
    return [actionOutcome!, filingOutcome!]
  } finally {
    release.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
