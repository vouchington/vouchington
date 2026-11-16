import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

/** Hold each real writer at the query edge which closes the three-transaction dependency. */
export async function raceCopyrightCompensationWithPublisherAndGuest<
  Publisher,
  Filing,
  Compensation,
>(input: {
  placementId: string
  noticeId: string
  intentId: string
  publisher: () => Promise<Publisher>
  filing: () => Promise<Filing>
  compensate: () => Promise<Compensation>
}): Promise<
  [
    PromiseSettledResult<Publisher>,
    PromiseSettledResult<Filing>,
    PromiseSettledResult<Compensation>,
  ]
> {
  const publisherReady = Promise.withResolvers<void>()
  const filingReady = Promise.withResolvers<void>()
  const renewed = Promise.withResolvers<void>()
  const resumePublisher = Promise.withResolvers<void>()
  const resumeFiling = Promise.withResolvers<void>()
  const resumeCompensation = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  let publisherPaused = false
  let filingPaused = false
  let renewalPaused = false
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          if (
            !filingPaused &&
            text.includes('/* preemptCopyrightRestorations */') &&
            values.includes(input.noticeId)
          ) {
            filingPaused = true
            filingReady.resolve()
            await resumeFiling.promise
          }
          const result = await Reflect.apply(target, thisArgument, args)
          if (
            !publisherPaused &&
            text.includes('/* lockImageDeliveryMutation:lockPlacements */') &&
            values.some(value => Array.isArray(value) && value.includes(input.placementId))
          ) {
            publisherPaused = true
            publisherReady.resolve()
            await resumePublisher.promise
          }
          if (
            !renewalPaused &&
            text.includes('/* renewCopyrightActionIntentLease */') &&
            values.includes(input.intentId)
          ) {
            renewalPaused = true
            renewed.resolve()
            await resumeCompensation.promise
          }
          return result
        },
      }),
  )
  try {
    const publisher = input.publisher()
    pending.push(publisher)
    const publisherSettled = Promise.allSettled([publisher])
    await Promise.race([
      publisherReady.promise,
      publisherSettled.then(() => {
        throw new Error('Publisher exited before its placement guard')
      }),
    ])
    const filing = input.filing()
    pending.push(filing)
    const filingSettled = Promise.allSettled([filing])
    await Promise.race([
      filingReady.promise,
      filingSettled.then(() => {
        throw new Error('Filing exited before preemption')
      }),
    ])
    const compensation = input.compensate()
    pending.push(compensation)
    const compensationSettled = Promise.allSettled([compensation])
    await Promise.race([
      renewed.promise,
      compensationSettled.then(() => {
        throw new Error('Compensation exited before actual renewal')
      }),
    ])
    resumePublisher.resolve()
    resumeFiling.resolve()
    resumeCompensation.resolve()
    const [[publisherOutcome], [filingOutcome], [compensationOutcome]] = await Promise.all([
      publisherSettled,
      filingSettled,
      compensationSettled,
    ])
    return [publisherOutcome!, filingOutcome!, compensationOutcome!]
  } finally {
    resumePublisher.resolve()
    resumeFiling.resolve()
    resumeCompensation.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
