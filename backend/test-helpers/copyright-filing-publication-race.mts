import type { QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

/** Release publication once the filing reaches its actual conflicting registry write. */
export async function raceCopyrightFilingWithPublication<Publisher, Filing>(input: {
  placementId: string
  boundary: 'before_proof' | 'after_proof'
  publisher: () => Promise<Publisher>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Publisher>, PromiseSettledResult<Filing>]> {
  const publisherReady = Promise.withResolvers<void>()
  const correctionAttempt = Promise.withResolvers<void>()
  const resumePublisher = Promise.withResolvers<void>()
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
          const owned = values.some(
            value => Array.isArray(value) && value.includes(input.placementId),
          )
          if (
            (owned && text.includes('/* lockCopyrightPlacementTransitions */')) ||
            text.includes('/* imposeCopyrightCourtFilingRestrictions:withhold */') ||
            (owned && text.includes('/* stageImagePlacementDeliveryRecords */'))
          )
            correctionAttempt.resolve()
          const selected = !paused && owned && text.includes('/* imageDeliveryAuthorizations */')
          if (selected) paused = true
          if (selected && input.boundary === 'before_proof') {
            publisherReady.resolve()
            await resumePublisher.promise
          }
          const result = await Reflect.apply(target, thisArgument, args)
          if (selected && input.boundary === 'after_proof') {
            publisherReady.resolve()
            await resumePublisher.promise
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
        throw new Error('Publication exited before its legal proof boundary')
      }),
    ])
    const filing = input.filing()
    pending.push(filing)
    const filingSettled = Promise.allSettled([filing])
    await Promise.race([correctionAttempt.promise, filingSettled])
    resumePublisher.resolve()
    const [[publisherOutcome], [filingOutcome]] = await Promise.all([
      publisherSettled,
      filingSettled,
    ])
    return [publisherOutcome!, filingOutcome!]
  } finally {
    resumePublisher.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}

/** The publisher has claimed its record; admission commits before its placement read resumes. */
export async function admitCopyrightFilingWhilePublisherPaused<Publisher, Filing>(input: {
  placementId: string
  publisher: () => Promise<Publisher>
  filing: () => Promise<Filing>
}): Promise<[PromiseSettledResult<Publisher>, PromiseSettledResult<Filing>]> {
  const ready = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const pending: Promise<unknown>[] = []
  let paused = false
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, receiver, args: Parameters<QueryExecutor>) {
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values =
            typeof statement === 'string' ? (parameters ?? []) : (statement.values ?? [])
          if (
            !paused &&
            text.includes('/* lockImageDeliveryMutation:lockPlacements */') &&
            values.some(value => Array.isArray(value) && value.includes(input.placementId))
          ) {
            paused = true
            ready.resolve()
            await resume.promise
          }
          return Reflect.apply(target, receiver, args)
        },
      }),
  )
  try {
    const publisher = input.publisher()
    pending.push(publisher)
    const publisherSettled = Promise.allSettled([publisher])
    await Promise.race([
      ready.promise,
      publisherSettled.then(([outcome]) => {
        if (outcome?.status === 'rejected') throw outcome.reason
        throw new Error('Publisher exited before its placement read')
      }),
    ])
    const filing = input.filing()
    pending.push(filing)
    const filingSettled = await Promise.allSettled([filing])
    resume.resolve()
    const [publisherOutcome] = await publisherSettled
    return [publisherOutcome!, filingSettled[0]!]
  } finally {
    resume.resolve()
    restore()
    await Promise.allSettled(pending)
  }
}
