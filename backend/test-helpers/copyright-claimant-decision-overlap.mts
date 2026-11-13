import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'

/** Two old snapshots compete at the real correspondence write; no read-lock observation is used. */
export async function overlapClaimantRejectionAndReversal(noticeId: string) {
  const rejectionReady = Promise.withResolvers<void>()
  const reversalReady = Promise.withResolvers<void>()
  const startRejection = Promise.withResolvers<void>()
  const startReversal = Promise.withResolvers<void>()
  const reversalStarted = Promise.withResolvers<void>()
  const writeReached = Promise.withResolvers<void>()
  const releaseWrite = Promise.withResolvers<void>()
  let paused = false

  async function actor(event: 'not_accepted' | 'reversed') {
    const ready = event === 'not_accepted' ? rejectionReady : reversalReady
    try {
      await using transaction = await beginTransaction({ serializable: true })
      // A regular owned-row read establishes each actor's snapshot before either writes.
      await transaction(sql`/* overlapClaimantDecision:snapshot */
        SELECT id FROM copyright_notices WHERE id = ${noticeId}`)
      ready.resolve()
      await (event === 'not_accepted' ? startRejection.promise : startReversal.promise)
      if (event === 'reversed') reversalStarted.resolve()
      const query = new Proxy(transaction, {
        async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
          const [input] = argumentsList
          const text = typeof input === 'string' ? input : input.text
          if (
            event === 'not_accepted' &&
            !paused &&
            text.includes('/* createDeterministicCopyrightCorrespondencesInTransaction */')
          ) {
            paused = true
            writeReached.resolve()
            await releaseWrite.promise
          }
          return Reflect.apply(target, thisArgument, argumentsList)
        },
      })
      await createCopyrightClaimantDecisionNoticeInTransaction({ noticeId, event }, query)
      await transaction.commit()
    } finally {
      ready.resolve()
      if (event === 'not_accepted') writeReached.resolve()
      else reversalStarted.resolve()
    }
  }

  const rejection = Promise.allSettled([actor('not_accepted')]).then(([result]) => result!)
  const reversal = Promise.allSettled([actor('reversed')]).then(([result]) => result!)
  try {
    await Promise.all([rejectionReady.promise, reversalReady.promise])
    startRejection.resolve()
    await writeReached.promise
    // The other actor always runs once, including when PostgreSQL aborts before the write barrier.
    startReversal.resolve()
    await reversalStarted.promise
    releaseWrite.resolve()
    return { rejection: await rejection, reversal: await reversal, paused }
  } finally {
    startRejection.resolve()
    startReversal.resolve()
    releaseWrite.resolve()
    await Promise.all([rejection, reversal])
  }
}
