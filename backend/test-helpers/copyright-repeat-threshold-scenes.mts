import { createTestUser } from './index.mts'
import { createEffectiveReviewNotice } from './copyright-effective-review-fixtures.mts'
import { seedEffectiveConfirmation } from './copyright-effective-review-decisions.mts'
import { seedServiceReviewAppeal } from './copyright-service-appeal-prerequisite.mts'
import { listCopyrightRepeatInfringerAccountsForNotice } from '../services/copyright-notices/repeat-infringer-accounts.mts'

/** Two complete canonical confirmations own the open review before administrative/reversal subjects. */
export async function createOwnedRepeatThresholdScene() {
  const [poster, moderator, admin] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const first = await createEffectiveReviewNotice([poster.id], moderator)
  const second = await createEffectiveReviewNotice([poster.id], moderator)
  await seedEffectiveConfirmation(first.noticeId, first.restrictions[0]!.id, moderator)
  await seedEffectiveConfirmation(second.noticeId, second.restrictions[0]!.id, moderator)
  const reviewId = (
    await listCopyrightRepeatInfringerAccountsForNotice(moderator, first.noticeId)
  )[0]?.open_review_id
  if (!reviewId) throw new Error('Owned repeat threshold did not open a review')
  const appeal = await seedServiceReviewAppeal(poster, first.noticeId, crypto.randomUUID(), {
    reason: 'Please review.',
    targetIds: [first.restrictions[0]!.targetId],
  })
  const enforcement = {
    currentUser: admin,
    reviewId,
    outcome: 'restrict' as const,
    rationale: 'Two confirmed notices remain.',
    recordedAt: new Date(),
  }
  const reversal = {
    submissionId: appeal.submission.id,
    currentUser: moderator,
    recommendationId: null,
    manualFallbackReason: 'Manual review.',
    rationale: 'The evidence was reviewed.',
    decisions: [{ restrictionId: first.restrictions[0]!.id, action: 'reverse' as const }],
  }
  return { poster, moderator, admin, first, second, reviewId, appeal, enforcement, reversal }
}
