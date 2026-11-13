import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { createRequest } from './api/server.mts'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

async function readCounterState(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const { rows: scopes } = await write<{
    assessment: string
    target: string
  }>(sql`/* readCounterState:scopes */
    SELECT scope.copyright_notice_submission_assessment_identity_id AS assessment,
      scope.copyright_notice_target_id AS target
    FROM copyright_notice_counter_notice_assessment_targets scope
    JOIN copyright_notice_targets target ON target.id = scope.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId} ORDER BY assessment, scope.copyright_notice_target_id`)
  return {
    state: await readCopyrightAssessmentRaceState(noticeId),
    reviews: aggregate!.counterNoticeReviews,
    scopes,
  }
}

/** Rejection creates one assessment, current tip, review, status and audit, and never a deadline. */
export async function assertCopyrightApiCounterRejection(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  submissionId: string
  reviewerId: string
  posterId: string
  body: { is_accepted: boolean; rationale: string }
}) {
  const before = await readCounterState(input.noticeId)
  const response = await input.staff
    .post(`/api/v1/copyright-submissions/${input.submissionId}/counter-notice-reviews`)
    .send(input.body)
  const after = await readCounterState(input.noticeId)
  const review = after.reviews[0]
  const id = review?.copyright_notice_submission_assessment_identity_id
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      notice: undefined,
      assessment: undefined,
      deadline: undefined,
      state: before,
    },
    {
      status: 200,
      code: undefined,
      message: undefined,
      notice: { id: input.noticeId },
      assessment: id,
      deadline: null,
      state: {
        ...before,
        reviews: [
          expect.objectContaining({
            copyright_notice_submission_id: input.submissionId,
            copyright_notice_submission_assessment_identity_id: id,
            copyright_notice_deadline_id: null,
            reviewed_by_id: input.reviewerId,
            is_accepted: false,
            reviewed_at: expect.any(Date),
            rationale_ciphertext: expect.any(String),
          }),
        ],
        state: {
          ...before.state,
          assessments: [...before.state.assessments, { id, supersedes: null, compliant: false }],
          identities: [...before.state.identities, id].toSorted((a, b) =>
            (a ?? '').localeCompare(b ?? ''),
          ),
          pointers: before.state.pointers.map(row =>
            row.id === input.submissionId ? { id: row.id, assessment: id, compliant: false } : row,
          ),
          events: [...before.state.events, 'counter_notice_reviewed'].toSorted(),
          deliveries: [
            ...before.state.deliveries,
            `status_update:in_app:${input.posterId}`,
          ].toSorted(),
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    notice: response.body.copyright_notice,
    assessment: response.body.assessment_id,
    deadline: response.body.deadline_id,
    state: after,
  })
}
