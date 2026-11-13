import { prepublishCopyrightImagePlacementDenial } from '../services/copyright-notices/action-delivery-edge.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { createTestUser } from './index.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'

/** Exactly one current automated target is committed; the reporting reader still sees both notified items. */
export async function seedDsaAutomatedReportingTarget(
  scene: Awaited<ReturnType<typeof createClearScreenedForm>>,
) {
  const { notice, screeningId } = scene
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: null,
    substantiallyCompliant: true,
    copyrightFormScreeningId: screeningId,
  })
  const aggregate = (await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id))!
  const target = aggregate.targets[0]
  if (!target) throw new Error('Owned automated reporting target disappeared')
  const reviewer = await createTestUser({ extraRoles: ['moderator'] })
  await seedCopyrightStatementRestriction({
    noticeId: aggregate.notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: reviewer.id,
    automated: true,
    reviewed: false,
  })
}

/** A completed withhold includes the old tuple denial as well as the physically current denied tuple. */
export async function seedDsaReportingWithhold(noticeId: string, intentId: string) {
  const aggregate = (await getCopyrightNoticePrivateAggregate(noticeId))!
  const action = aggregate.actionIntents.find(row => row.id === intentId)
  const restriction = aggregate.restrictions.find(
    row => row.id === action?.copyright_restriction_id,
  )
  const target = aggregate.targets.find(row => row.id === restriction?.copyright_notice_target_id)
  if (!target?.image_id) throw new Error('Owned report withhold has no current image target')
  await prepublishCopyrightImagePlacementDenial({
    placementId: target.placement_id,
    revision: target.placement_revision,
    imageId: target.image_id,
  })
  await seedRestorationSceneWithhold(intentId)
}
