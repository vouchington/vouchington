import { createTestUser } from './index.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** A current clear signed-in screen and complete provisional authority precede the real review. */
export async function createCopyrightApiUnreviewedCase() {
  const [poster, claimant, moderator] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const { notice, screeningId } = await createClearScreenedForm(1, { poster, claimant })
  const noticeId = notice.intake.copyright_notice_id
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: null,
    substantiallyCompliant: true,
    copyrightFormScreeningId: screeningId,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const target = aggregate?.targets[0]
  if (!target) throw new Error('Owned API review target disappeared')
  const restriction = await seedCopyrightStatementRestriction({
    noticeId,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: moderator.id,
    automated: true,
    reviewed: false,
  })
  return {
    noticeId,
    targetId: target.id,
    restrictionId: restriction.id,
    target,
    restriction,
    poster,
    claimant,
    moderator,
    notice,
  }
}
