import { onTestFinished } from 'vitest'
import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'
import { interceptPostgresTransactionQueriesForTest } from './injected-transaction-queries.mts'

/** Admit a real filing between preparation's legal read and its first lifecycle write. */
export async function raceCopyrightPreparationWithGuestFiling<Action, Filing>(input: {
  intentId: string
  noticeId: string
  restrictionId: string
  action: () => Promise<Action>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Action>, PromiseSettledResult<Filing>]> {
  const preparationReady = Promise.withResolvers<void>()
  const filingReady = Promise.withResolvers<void>()
  const eventAttempt = Promise.withResolvers<void>()
  let prepared = false
  const pending: Promise<unknown>[] = []
  const release = () => {
    preparationReady.resolve()
    filingReady.resolve()
    eventAttempt.resolve()
  }
  onTestFinished(release)
  const restore = interceptPostgresTransactionQueriesForTest(
    (text, values) => {
      if (text.includes('preemptCopyrightRestorations') && values.includes(input.noticeId)) {
        filingReady.resolve()
        return true
      }
      if (
        (text.includes('processCopyrightActionIntent:event') && values.includes(input.intentId)) ||
        (text.includes('processCopyrightActionIntent:liftRestriction') &&
          values.includes(input.restrictionId))
      )
        eventAttempt.resolve()
      return false
    },
    () => eventAttempt.promise,
  )
  try {
    const { result } = await observeTestPostgresClientQueries(
      async () => {
        const action = input.action()
        pending.push(action)
        const actionSettled = Promise.allSettled([action])
        void action.catch((err: unknown) => {
          preparationReady.reject(err)
          filingReady.resolve()
          eventAttempt.resolve()
        })
        await preparationReady.promise
        const filing = input.filing()
        pending.push(filing)
        const filingSettled = Promise.allSettled([filing])
        void filing.catch(filingReady.reject)
        const [[actionOutcome], [filingOutcome]] = await Promise.all([actionSettled, filingSettled])
        return [actionOutcome!, filingOutcome!] as const
      },
      async query => {
        if (prepared) return
        if (
          !query.text.includes('processCopyrightActionIntent:otherActiveRestrictions') ||
          !query.values.includes(input.restrictionId)
        )
          return
        prepared = true
        preparationReady.resolve()
        await filingReady.promise
      },
    )
    return [...result]
  } finally {
    release()
    restore()
    await Promise.allSettled(pending)
  }
}
