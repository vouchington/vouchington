import type pg from 'pg'
import { writePool, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { reviewCopyrightFormIntake } from '../services/copyright-notices/form-reviews.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'

/** Establish both snapshots, then commit the first decision before the sibling's case write. */
export async function reviewFormAndAssessCopyrightSubmission(
  review: Parameters<typeof reviewCopyrightFormIntake>[0],
  assessment: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  noticeId: string,
  firstKind: 'review' | 'assessment',
) {
  return runPoolObservationExclusively(async () => {
    const secondReady = Promise.withResolvers<void>()
    const firstCommitted = Promise.withResolvers<void>()
    const restorations = new Map<pg.PoolClient, () => void>()
    const settled = <T,>(operation: () => Promise<T>): Promise<PromiseSettledResult<T>> =>
      operation()
        .then(value => ({ status: 'fulfilled' as const, value }))
        .catch((err: unknown) => ({ status: 'rejected' as const, reason: err }))
    const reviewOperation = () => reviewCopyrightFormIntake(review)
    const assessmentOperation = () => appendCopyrightSubmissionAssessment(assessment)
    const firstOperation = firstKind === 'review' ? reviewOperation : assessmentOperation
    const secondOperation = firstKind === 'review' ? assessmentOperation : reviewOperation
    const firstMarker =
      firstKind === 'review'
        ? 'reviewCopyrightFormIntake:review'
        : 'appendCopyrightSubmissionAssessment:event'
    const secondId = firstKind === 'review' ? assessment.submissionId : review.intakeId
    let firstClient: pg.PoolClient | undefined
    let secondClient: pg.PoolClient | undefined
    let first: ReturnType<typeof settled> | undefined
    let second: ReturnType<typeof settled> | undefined
    let started = false
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
          !Array.isArray(statement.values)
        )
          return Reflect.apply(original, client, args)
        if (started && client !== firstClient && statement.values.includes(secondId))
          secondClient = client
        if (
          client === secondClient &&
          statement.text.includes('/* appendCopyrightSubmissionAssessment:event */')
        ) {
          secondReady.resolve()
          return firstCommitted.promise.then(() => Reflect.apply(original, client, args))
        }
        const pending = Reflect.apply(original, client, args)
        if (
          !started &&
          statement.text.includes(`/* ${firstMarker} */`) &&
          statement.values.some(value =>
            [noticeId, review.intakeId, assessment.submissionId].includes(value as string),
          )
        ) {
          started = true
          firstClient = client
          return Promise.resolve(pending).then(async result => {
            second = settled<unknown>(secondOperation)
            void second.then(() => secondReady.resolve())
            await secondReady.promise
            return result
          })
        }
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      first = settled<unknown>(firstOperation)
      const firstResult = await first
      firstCommitted.resolve()
      if (!second) {
        if (firstResult.status === 'rejected') throw firstResult.reason
        throw new Error('Owned decision did not reach its commit-order overlap')
      }
      const secondResult = await second
      return firstKind === 'review'
        ? { reviewed: firstResult, assessed: secondResult }
        : { reviewed: secondResult, assessed: firstResult }
    } finally {
      firstCommitted.resolve()
      await Promise.allSettled([first, second])
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}

export async function readCopyrightAssessmentPointers(noticeId: string) {
  const { rows } = await read<{ id: string; current_assessment_identity_id: string | null }>(sql`
    /* readCopyrightAssessmentPointers */ SELECT id, current_assessment_identity_id
    FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId} ORDER BY id`)
  return rows
}
