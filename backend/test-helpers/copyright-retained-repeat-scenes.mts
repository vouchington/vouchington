import { createTestUser, softDeleteUser } from './index.mts'
import { createEffectiveReviewNotice } from './copyright-effective-review-fixtures.mts'
import { seedEffectiveConfirmation } from './copyright-effective-review-decisions.mts'
import { seedServiceReviewAppeal } from './copyright-service-appeal-prerequisite.mts'

/** A retained incident and the full owned appeal request commit before the deleted-account review subject. */
export async function createRetainedRepeatScene(targetCount = 1) {
  const [poster, moderator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const fixture = await createEffectiveReviewNotice(
    Array<string>(targetCount).fill(poster.id),
    moderator,
  )
  const first = fixture.restrictions[0]!
  await seedEffectiveConfirmation(fixture.noticeId, first.id, moderator)
  const appeal = await seedServiceReviewAppeal(poster, fixture.noticeId, crypto.randomUUID(), {
    reason: 'Please review the retained restriction.',
    targetIds: [first.targetId],
  })
  await softDeleteUser(poster.id)
  return { poster, moderator, fixture, first, appeal }
}

export function retainedRepeatAppealDecision(
  scene: Awaited<ReturnType<typeof createRetainedRepeatScene>>,
  action: 'confirm' | 'reverse',
) {
  return {
    submissionId: scene.appeal.submission.id,
    currentUser: scene.moderator,
    recommendationId: null,
    manualFallbackReason: 'The retained record supports a manual review.',
    rationale: 'The retained evidence was reviewed.',
    decisions: [{ restrictionId: scene.first.id, action }],
  }
}
