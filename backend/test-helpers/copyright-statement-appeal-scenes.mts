import { createTestUser } from './index.mts'
import { createCommittedCopyrightStatementScene } from './copyright-statement-scene.mts'
import { seedServiceReviewAppeal } from './copyright-service-appeal-prerequisite.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

export async function createStatementAppealScene(action: 'confirm' | 'reverse', withheld = false) {
  const poster = await createTestUser()
  const scene = await createCommittedCopyrightStatementScene({ poster }, { automated: true })
  const noticeId = scene.notice.intake.copyright_notice_id
  const restriction = scene.restriction!
  if (withheld) {
    const aggregate = (await getCopyrightNoticePrivateAggregate(noticeId))!
    const withhold = aggregate.actionIntents.find(row => row.action === 'withhold')!
    await seedRestorationSceneWithhold(withhold.id)
  }
  const appeal = await seedServiceReviewAppeal(poster, noticeId, crypto.randomUUID(), {
    reason: 'I created the image.',
    targetIds: [restriction.copyright_notice_target_id],
  })
  const decision = {
    submissionId: appeal.submission.id,
    currentUser: scene.moderator,
    recommendationId: null,
    manualFallbackReason: 'Manual review.',
    rationale: 'Reviewed the complete record.',
    decisions: [{ restrictionId: restriction.id, action }],
  }
  return { ...scene, poster, noticeId, restriction, decision }
}
