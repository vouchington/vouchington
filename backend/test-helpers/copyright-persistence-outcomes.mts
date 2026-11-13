import { expect } from 'vitest'
import { enforceCopyrightAssessment } from '../services/copyright-notices/enforce-assessment.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import {
  assessmentSerializationConflict,
  copyrightRaceResult,
  copyrightRestrictedRaceState,
  nativeCopyrightSerializationConflict,
  readCopyrightAssessmentRaceState,
} from './copyright-assessment-race-outcomes.mts'

/** One target is owed: imposition either commits all obligations or remains wholly owed. */
export async function assertOwedPersistenceRestriction(input: {
  noticeId: string
  assessmentId: string
  moderatorId: string
  posterId: string
  targetId: string
  revision: number
}) {
  const before = await readCopyrightAssessmentRaceState(input.noticeId)
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [result] = await Promise.allSettled([enforceCopyrightAssessment(input.assessmentId)])
  const after = await readCopyrightAssessmentRaceState(input.noticeId)
  const success = copyrightRestrictedRaceState(
    before,
    {
      assessmentId: input.assessmentId,
      targetId: input.targetId,
      imposedById: input.moderatorId,
    },
    after.restrictions[0]?.id,
    input.posterId,
    input.revision,
    staydown,
  )
  expect([
    {
      outcome: { status: 'fulfilled' },
      state: {
        ...success,
        deliveries: [
          ...success.deliveries,
          `claimant_decision_notice:email:${input.posterId}`,
          `claimant_decision_notice:in_app:${input.posterId}`,
        ].toSorted(),
      },
    },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
  })
}

/** Counter-notice correction cancels its deadline in the same assessment transaction. */
export async function assertPersistenceCorrection(
  noticeId: string,
  input: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
) {
  const before = await readCopyrightAssessmentRaceState(noticeId)
  const [result] = await Promise.allSettled([appendCopyrightSubmissionAssessment(input)])
  const after = await readCopyrightAssessmentRaceState(noticeId)
  const id = after.assessments.find(row => row.supersedes === input.supersedesAssessmentId)?.id
  expect([
    { outcome: assessmentSerializationConflict, state: before },
    {
      outcome: { status: 'fulfilled', id },
      state: {
        ...before,
        assessments: [
          ...before.assessments,
          { id, supersedes: input.supersedesAssessmentId, compliant: false },
        ],
        identities: [...before.identities, id].toSorted((a, b) => (a ?? '').localeCompare(b ?? '')),
        pointers: before.pointers.map(row =>
          row.id === input.submissionId ? { id: row.id, assessment: id, compliant: false } : row,
        ),
        deadlines: before.deadlines.map(row => ({
          ...row,
          cancelled_at: input.assessedAt,
          updated_at: expect.any(Date),
        })),
        events: [...before.events, 'submission_assessed'].toSorted(),
      },
    },
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
}

/** A stale-tip guard has no effects, including when SSI interrupts the guard itself. */
export async function assertPersistenceStaleTip(
  noticeId: string,
  input: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
) {
  const before = await readCopyrightAssessmentRaceState(noticeId)
  const [result] = await Promise.allSettled([appendCopyrightSubmissionAssessment(input)])
  expect([
    { outcome: assessmentSerializationConflict, state: before },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: undefined,
        message: 'Assessment must extend the current assessment tip',
        causeCode: undefined,
      },
      state: before,
    },
  ]).toContainEqual({
    outcome: copyrightRaceResult(result!),
    state: await readCopyrightAssessmentRaceState(noticeId),
  })
}
