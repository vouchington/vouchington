import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { createTestPostgresClientLoan } from './postgres-client-loan.mts'
import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'
import { completeCopyrightMandatoryHumanReview } from '../services/copyright-notices/human-review.mts'
import { createEligibleCopyrightRestoreIntent } from '../services/copyright-notices/restoration.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'

export async function acceptAndSupersedeCopyrightNotice(
  acceptance: Parameters<typeof acceptCopyrightNoticeAndImposeRestriction>[0],
  assessment: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  first: 'restriction' | 'assessment',
) {
  const accept = async () => {
    try {
      return {
        status: 'fulfilled' as const,
        value: await acceptCopyrightNoticeAndImposeRestriction(acceptance),
      }
    } catch (err) {
      if ((err as { status?: number } | null)?.status !== 422) throw err
      return { status: 'rejected' as const, reason: err }
    }
  }
  const assess = () => appendCopyrightSubmissionAssessment(assessment)
  const ownedIds = [acceptance.noticeId, acceptance.targetId, assessment.submissionId]
  if (first === 'restriction') {
    const [restricted, assessed] = await overlapCopyrightWriters(
      'acceptCopyrightNoticeAndImposeRestriction:lockNotice',
      accept,
      assess,
      ownedIds,
    )
    return { restricted, assessed }
  }
  const [assessed, restricted] = await overlapCopyrightWriters(
    'appendCopyrightSubmissionAssessment',
    assess,
    accept,
    ownedIds,
  )
  return { restricted, assessed }
}

export async function reviewAndRestoreCopyrightRestriction(
  review: Parameters<typeof completeCopyrightMandatoryHumanReview>[0],
  restoration: Parameters<typeof createEligibleCopyrightRestoreIntent>[0],
) {
  const [reviewed, restored] = await commitCopyrightWritersInOrder(
    () => completeCopyrightMandatoryHumanReview(review),
    () => createEligibleCopyrightRestoreIntent(restoration),
    'completeCopyrightMandatoryHumanReview',
    'lockCopyrightNoticeForLegalWrite',
    review.noticeId,
    [review.noticeId, review.restrictionId, restoration.targetId, restoration.deadlineId],
  )
  return { review: reviewed, restoration: restored }
}

async function overlapCopyrightWriters<First, Second>(
  firstMarker: string,
  firstOperation: () => Promise<First>,
  secondOperation: () => Promise<Second>,
  ownedIds: string[],
): Promise<[First, Second]> {
  return runPoolObservationExclusively(async () => {
    const loanReady = Promise.withResolvers<ReturnType<typeof createTestPostgresClientLoan>>()
    void loanReady.promise.catch(() => {})
    const restorations = new Map<pg.PoolClient, () => void>()
    const loans = new Map<pg.PoolClient, ReturnType<typeof createTestPostgresClientLoan>>()
    let firstClient: pg.PoolClient | undefined
    let transactionId: string | undefined
    let first: Promise<First> | undefined
    let second: Promise<Second> | undefined
    let startedSecond = false
    const observe = (client: pg.PoolClient) => {
      if (restorations.has(client)) return
      const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const original = client.query
      restorations.set(client, () => {
        if (descriptor) Object.defineProperty(client, 'query', descriptor)
        else Reflect.deleteProperty(client, 'query')
      })
      const query = ((...args: unknown[]) => {
        const statement = args[0]
        if (
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.some(value => typeof value === 'string' && ownedIds.includes(value))
        )
          return Reflect.apply(original, client, args)
        if (transactionId && client !== firstClient && !loans.has(client)) {
          const loan = createTestPostgresClientLoan(client, { kind: 'transaction', transactionId })
          loans.set(client, loan)
          loanReady.resolve(loan)
          return loan.ready.then(() => Reflect.apply(original, client, args))
        }
        const pending = Reflect.apply(original, client, args)
        if (!startedSecond && statement.text.includes(`/* ${firstMarker} */`)) {
          firstClient = client
          startedSecond = true
          return Promise.resolve(pending).then(async result => {
            const id = await client.query<{ id: string }>('SELECT pg_current_xact_id()::text AS id')
            transactionId = id.rows[0]!.id
            second = secondOperation()
            const outcome = Promise.allSettled([second])
            void outcome.then(([settled]) => {
              if (settled?.status === 'rejected') loanReady.reject(settled.reason)
            })
            const loan = await loanReady.promise
            await loan.ready
            // Removing a redundant generation write can let the sibling commit without waiting.
            // Resume after that completed public effect or its native transaction wait.
            await loan.wait(outcome).catch(async (err: unknown) => {
              const [settled] = await outcome
              if (settled?.status !== 'fulfilled') throw err
            })
            return result
          })
        }
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      await (first = firstOperation())
      if (first === undefined || second === undefined)
        throw new Error('Owned writes did not reach the overlap')
      return await Promise.all([first, second])
    } finally {
      await Promise.allSettled([first, second])
      await Promise.allSettled([...loans.values()].map(loan => loan.dispose()))
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
