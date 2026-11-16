import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import type { QueryExecutor } from '@data-stores/psql'

/** Race real action and hold producers at their generation and written-notice boundaries. */
export async function raceCopyrightActionWithHold<Action, Hold>(input: {
  noticeId: string
  intentId: string
  completion?: {
    restrictionId: string
    deliveryPublished: () => boolean
    fileHold: () => Promise<void>
  }
  action: () => Promise<Action>
  hold: () => Promise<Hold>
}): Promise<[PromiseSettledResult<Action>, PromiseSettledResult<Hold>]> {
  const atEvent = Promise.withResolvers<void>()
  const atNotice = Promise.withResolvers<void>()
  const releaseEvent = Promise.withResolvers<void>()
  const releaseNotice = Promise.withResolvers<void>()
  const atCompletionRead = Promise.withResolvers<void>()
  const releaseCompletionRead = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  let eventPaused = false
  let noticePaused = false
  let completionReadPaused = false
  let completingTransaction: QueryExecutor | undefined
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          if (
            !eventPaused &&
            (!input.completion || target === completingTransaction) &&
            text.includes('/* lockCopyrightActionGenerationForWrite */') &&
            values.includes(input.noticeId)
          ) {
            eventPaused = true
            atEvent.resolve()
            await releaseEvent.promise
          }
          const result = await Reflect.apply(target, thisArgument, args)
          if (
            !completionReadPaused &&
            input.completion?.deliveryPublished() &&
            text.includes('/* hasOtherActiveCopyrightRestrictions */') &&
            values.includes(input.completion.restrictionId)
          ) {
            completingTransaction = target
            completionReadPaused = true
            atCompletionRead.resolve()
            await releaseCompletionRead.promise
          }
          if (
            !noticePaused &&
            text.includes('/* lockCopyrightNoticeForLegalWrite */') &&
            values.includes(input.noticeId)
          ) {
            noticePaused = true
            atNotice.resolve()
            await releaseNotice.promise
          }
          return result
        },
      }),
  )
  try {
    const action = input.action()
    pending.push(action)
    void action.catch(() => undefined)
    const reaches = (boundary: Promise<void>) =>
      Promise.race([
        boundary,
        action.then(() => {
          throw new Error('Owned action completed without reaching its event boundary')
        }),
      ])
    await reaches(input.completion ? atCompletionRead.promise : atEvent.promise)
    await input.completion?.fileHold()
    const hold = input.hold()
    pending.push(hold)
    void hold.catch(() => undefined)
    await Promise.race([
      atNotice.promise,
      hold.then(() => {
        throw new Error('Owned hold completed without reaching its notice boundary')
      }),
    ])
    releaseCompletionRead.resolve()
    if (input.completion) await reaches(atEvent.promise)
    releaseEvent.resolve()
    releaseNotice.resolve()
    return await Promise.allSettled([action, hold])
  } finally {
    releaseEvent.resolve()
    releaseNotice.resolve()
    releaseCompletionRead.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
