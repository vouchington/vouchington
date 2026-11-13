import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { reviewCopyrightCounterNotice } from '../services/copyright-notices/counter-notice-reviews.mts'
import { calculateUsCounterNoticeRestorationWindow } from '../services/copyright-notices/deadlines.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { effectiveReviewConflict } from './copyright-effective-review-outcomes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

async function readCounterReviewState(noticeId: string) {
  const legal = await readEffectiveReviewState(noticeId, [])
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const { rows: scope } = await write<{
    assessment: string
    target: string
  }>(sql`/* readServiceCounterReviewState:scope */
    SELECT scope.copyright_notice_submission_assessment_identity_id AS assessment,
      scope.copyright_notice_target_id AS target
    FROM copyright_notice_counter_notice_assessment_targets scope
    JOIN copyright_notice_submission_assessment_identities identity
      ON identity.id = scope.copyright_notice_submission_assessment_identity_id
    WHERE identity.copyright_notice_id = ${noticeId} ORDER BY assessment, target`)
  return {
    legal,
    scope,
    reviews: aggregate!.counterNoticeReviews.map(row => ({
      submission: row.copyright_notice_submission_id,
      assessment: row.copyright_notice_submission_assessment_identity_id,
      deadline: row.copyright_notice_deadline_id,
      accepted: row.is_accepted,
      reviewer: row.reviewed_by_id,
      rationale: decryptSecret(
        row.rationale_ciphertext,
        `copyright-counter-review:${row.copyright_notice_submission_id}`,
      ),
    })),
  }
}

/** A counter review either commits its clock, full scope and forwarding together or writes nothing. */
export async function assertServiceCounterReview(
  input: Parameters<typeof reviewCopyrightCounterNotice>[0],
  fixture: { noticeId: string; targetId: string; poster: { id: string } },
  options: { replay?: boolean } = {},
) {
  const before = await readCounterReviewState(fixture.noticeId)
  const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
  const submission = aggregate!.submissions.find(row => row.id === input.submissionId)!
  const window = calculateUsCounterNoticeRestorationWindow(submission.received_at)
  const { rows: started } = await write<{ now: Date }>(sql`/* serviceCounterReview:startClock */
    SELECT clock_timestamp() AS now`)
  const [result] = await Promise.allSettled([reviewCopyrightCounterNotice(input)])
  const { rows: ended } = await write<{ now: Date }>(sql`/* serviceCounterReview:endClock */
    SELECT clock_timestamp() AS now`)
  const { rows: timestamps } = await write<{
    id: string
    created_at: Date
    updated_at: Date
  }>(sql`/* serviceCounterReview:deadlineTimestamps */
    SELECT id, created_at, updated_at FROM copyright_notice_deadlines
    WHERE copyright_notice_id = ${fixture.noticeId} ORDER BY id`)
  const previousIds = new Set(before.legal.state.deadlines.map(row => row.id))
  const clockBounds = timestamps.flatMap(row =>
    previousIds.has(row.id)
      ? []
      : [
          {
            id: row.id,
            createdDuringInvocation:
              row.created_at >= started[0]!.now && row.created_at <= ended[0]!.now,
            updatedDuringInvocation:
              row.updated_at >= started[0]!.now && row.updated_at <= ended[0]!.now,
          },
        ],
  )
  const assessmentId = result!.status === 'fulfilled' ? result!.value.assessmentId : undefined
  const deadlineId = result!.status === 'fulfilled' ? result!.value.deadlineId : undefined
  const success = options.replay
    ? before
    : {
        legal: {
          ...before.legal,
          state: {
            ...before.legal.state,
            assessments: [
              ...before.legal.state.assessments,
              { id: assessmentId, supersedes: null, compliant: true },
            ],
            identities: [...before.legal.state.identities, assessmentId].toSorted((a, b) =>
              String(a).localeCompare(String(b)),
            ),
            pointers: before.legal.state.pointers.map(row =>
              row.id === input.submissionId
                ? { ...row, assessment: assessmentId, compliant: true }
                : row,
            ),
            deadlines: [
              ...before.legal.state.deadlines,
              {
                id: deadlineId,
                copyright_notice_id: fixture.noticeId,
                qualifying_counter_notice_assessment_identity_id: assessmentId,
                ...window,
                created_at: expect.any(Date),
                updated_at: expect.any(Date),
                resolved_at: null,
                cancelled_at: null,
              },
            ],
            events: [...before.legal.state.events, 'counter_notice_reviewed'].toSorted(),
            deliveries: [
              ...before.legal.state.deliveries,
              'counter_notice_forwarding:email:null',
              `status_update:in_app:${fixture.poster.id}`,
            ].toSorted(),
            correspondence: [
              ...before.legal.state.correspondence,
              'counter_notice_forwarding',
            ].toSorted(),
          },
        },
        scope: [...before.scope, { assessment: assessmentId, target: fixture.targetId }],
        reviews: [
          ...before.reviews,
          {
            submission: input.submissionId,
            assessment: assessmentId,
            deadline: deadlineId,
            accepted: true,
            reviewer: input.currentUser.id,
            rationale: input.rationale,
          },
        ],
      }
  const prior = before.reviews.find(row => row.submission === input.submissionId)
  expect([
    {
      outcome: {
        status: 'fulfilled',
        noticeId: fixture.noticeId,
        assessmentId: options.replay ? prior!.assessment : expect.any(String),
        deadlineId: options.replay ? prior!.deadline : expect.any(String),
      },
      state: success,
      clockBounds: options.replay
        ? []
        : [{ id: deadlineId, createdDuringInvocation: true, updatedDuringInvocation: true }],
    },
    { outcome: effectiveReviewConflict, state: before, clockBounds: [] },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled'
        ? { status: 'fulfilled', ...result!.value }
        : copyrightRaceResult(result!),
    state: await readCounterReviewState(fixture.noticeId),
    clockBounds,
  })
}
