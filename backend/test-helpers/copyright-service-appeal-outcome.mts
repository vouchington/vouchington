import { expect } from 'vitest'
import { reviewCopyrightAppeal } from '../services/copyright-notices/submission-reviews.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  expectedEffectiveReview,
  effectiveReviewConflict,
} from './copyright-effective-review-outcomes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Coupled request result and every appeal/restriction/account/notice/action effect. */
export async function assertServiceAppealReview(
  input: Parameters<typeof reviewCopyrightAppeal>[0],
  fixture: { noticeId: string; restrictionId: string; targetId: string; poster: { id: string } },
  options: { replay?: boolean } = {},
) {
  const before = await readEffectiveReviewState(fixture.noticeId, [fixture.poster.id])
  const beforeAggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
  const claimantId = beforeAggregate!.notice.claimant_user_id!
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [result] = await Promise.allSettled([reviewCopyrightAppeal(input)])
  const after = await readEffectiveReviewState(fixture.noticeId, [fixture.poster.id])
  const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
  const saved = aggregate!.appealReviews.filter(
    row => row.copyright_notice_submission_id === input.submissionId,
  )
  const reviewId = result!.status === 'fulfilled' ? result!.value.reviewIds[0] : undefined
  const target = before.state.targets.find(row => row.id === fixture.targetId)!
  const expected = expectedEffectiveReview(before, {
    noticeId: fixture.noticeId,
    restrictionId: fixture.restrictionId,
    targetId: fixture.targetId,
    revision: target.placement_revision,
    action: 'reverse',
    moderatorId: input.currentUser.id,
    posterId: fixture.poster.id,
    kind: 'appeal',
    submissionId: input.submissionId,
    reviewId,
    incidentUpdates: { [fixture.poster.id]: null },
    ownerTargets: { [fixture.poster.id]: [fixture.targetId] },
    staydown,
  })
  const success = options.replay
    ? before
    : {
        ...expected,
        state: {
          ...expected.state,
          deliveries: [
            ...expected.state.deliveries,
            `claimant_decision_notice:email:${claimantId}`,
            `claimant_decision_notice:in_app:${claimantId}`,
          ].toSorted(),
        },
      }
  const provenance = (rows: typeof saved) =>
    rows.map(row => ({
      id: row.id,
      submission: row.copyright_notice_submission_id,
      restriction: row.copyright_restriction_id,
      recommendation: row.copyright_notice_appeal_recommendation_id,
      action: row.action,
      reviewer: row.reviewed_by_id,
    }))
  const prior = provenance(
    beforeAggregate!.appealReviews.filter(
      row => row.copyright_notice_submission_id === input.submissionId,
    ),
  )
  expect([
    {
      outcome: {
        status: 'fulfilled',
        noticeId: fixture.noticeId,
        reviewIds: [options.replay ? prior[0]!.id : expect.any(String)],
      },
      state: success,
      provenance: options.replay
        ? prior
        : [
            {
              id: reviewId,
              submission: input.submissionId,
              restriction: fixture.restrictionId,
              recommendation: input.recommendationId,
              action: 'reverse',
              reviewer: input.currentUser.id,
            },
          ],
    },
    { outcome: effectiveReviewConflict, state: before, provenance: prior },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled'
        ? { status: 'fulfilled', ...result!.value }
        : copyrightRaceResult(result!),
    state: after,
    provenance: provenance(saved),
  })
}

/** Incomplete scope rejects atomically, including when PostgreSQL rejects its serializable read. */
export async function assertServiceIncompleteAppeal(
  input: Parameters<typeof reviewCopyrightAppeal>[0],
  noticeId: string,
  posterId: string,
) {
  const before = await readEffectiveReviewState(noticeId, [posterId])
  const [result] = await Promise.allSettled([reviewCopyrightAppeal(input)])
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 422,
        code: undefined,
        message: 'Appeal decisions must exactly cover every active restriction in the appeal',
        causeCode: undefined,
      },
      state: before,
    },
    { outcome: effectiveReviewConflict, state: before },
  ]).toContainEqual({
    outcome: copyrightRaceResult(result!),
    state: await readEffectiveReviewState(noticeId, [posterId]),
  })
}
