import { recoverMissingDecisionAssessments } from '../services/copyright-notices/enforcement-recovery.mts'
import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { markTestCopyrightNoticeErasedAndCommit } from './copyright-email-manual-association.mts'

/** Erase the real case after the assessment read accepted its current live snapshot. */
export function appendCopyrightAssessmentAfterErasure(
  input: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  noticeId: string,
) {
  return eraseAfterOwnedRead(
    input.submissionId,
    noticeId,
    'appendCopyrightSubmissionAssessment:lockSubmission',
    () => appendCopyrightSubmissionAssessment(input),
  )
}

/** A raced erasure rolls back the whole bounded missing-decision recovery page. */
export function recoverCopyrightAssessmentAfterErasure(submissionId: string, noticeId: string) {
  return eraseAfterOwnedRead(
    submissionId,
    noticeId,
    'recoverMissingCopyrightDecisionAssessments',
    () => recoverMissingDecisionAssessments({ ids: [submissionId] }),
  )
}

async function eraseAfterOwnedRead<Result>(
  ownedId: string,
  noticeId: string,
  marker: string,
  action: () => Promise<Result>,
): Promise<Result> {
  return runPoolObservationExclusively(async () => {
    let erased = false
    const restorations = new Map<pg.PoolClient, () => void>()
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
        const pending = Reflect.apply(original, client, args)
        if (
          erased ||
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !statement.text.includes(`/* ${marker} */`) ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.some(
            value => value === ownedId || (Array.isArray(value) && value.includes(ownedId)),
          )
        )
          return pending
        erased = true
        return Promise.resolve(pending).then(async result => {
          await markTestCopyrightNoticeErasedAndCommit(noticeId)
          return result
        })
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      const result = await action()
      if (!erased) throw new Error('Owned assessment did not read its submission')
      return result
    } finally {
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
