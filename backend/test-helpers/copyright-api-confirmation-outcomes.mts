import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import type { createCopyrightApiUnreviewedCase } from './copyright-api-review-fixtures.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { expectedEffectiveReview } from './copyright-effective-review-outcomes.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'

type Fixture = Awaited<ReturnType<typeof createCopyrightApiUnreviewedCase>>
/** Exact HTTP domain conflict is observable; its native cause is intentionally not exposed. */
export async function assertCopyrightApiConfirmation(
  staff: ReturnType<typeof createRequest>,
  fixture: Fixture,
  url: string,
  body: Record<string, unknown>,
  appealId?: string,
) {
  const before = await readEffectiveReviewState(fixture.noticeId, [fixture.poster.id])
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const response = await staff.post(url).send(body)
  const after = await readEffectiveReviewState(fixture.noticeId, [fixture.poster.id])
  const reviewId = after.appeals.find(row => row.submission === appealId)?.id
  const success = expectedEffectiveReview(before, {
    noticeId: fixture.noticeId,
    restrictionId: fixture.restrictionId,
    targetId: fixture.targetId,
    revision: fixture.target.placement_revision,
    action: 'confirm',
    moderatorId: fixture.moderator.id,
    posterId: fixture.poster.id,
    kind: appealId ? 'appeal' : 'human',
    submissionId: appealId,
    reviewId,
    incidentUpdates: { [fixture.poster.id]: true },
    ownerTargets: { [fixture.poster.id]: [fixture.targetId] },
    staydown,
  })
  success.state.deliveries.push(
    `claimant_decision_notice:email:${fixture.claimant.id}`,
    `claimant_decision_notice:in_app:${fixture.claimant.id}`,
  )
  success.state.deliveries.sort()
  const result = appealId
    ? { notice: response.body.copyright_notice, reviews: response.body.review_ids }
    : { restriction: response.body.copyright_restriction?.id }
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      result: appealId ? { notice: undefined, reviews: undefined } : { restriction: undefined },
      state: before,
    },
    {
      status: 200,
      code: undefined,
      message: undefined,
      result: appealId
        ? { notice: { id: fixture.noticeId }, reviews: [reviewId] }
        : { restriction: fixture.restrictionId },
      state: success,
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    result,
    state: after,
  })
}
