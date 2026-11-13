import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { createTestCopyrightStaff } from './services/copyright-notices/guest-capability.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { persistRecoveredCopyrightAssessment } from '../services/copyright-notices/form-reviews-recovered-assessment.mts'
import { recordClaimantMisuseEvent } from '../services/copyright-notices/claimant-misuse-ledger.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import { reverseAutomatedCopyrightRestrictionsInTransaction } from '../services/copyright-notices/form-reviews-reversal.mts'

export async function createScreenRecoveryScene(targetCount = 1) {
  const [claimant, poster, moderator] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestCopyrightStaff(),
  ])
  const { notice, screeningId } = await createClearScreenedForm(targetCount, { claimant, poster })
  return { notice, screeningId, claimant, poster, moderator }
}
export type ScreenRecoveryScene = Awaited<ReturnType<typeof createScreenRecoveryScene>>

export function seedScreenRecoveryAssessment(scene: ScreenRecoveryScene) {
  return seedCopyrightSubmissionAssessment({
    submissionId: scene.notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: null,
    substantiallyCompliant: true,
    copyrightFormScreeningId: scene.screeningId,
  })
}

export async function seedScreenRecoveryRestriction(
  scene: ScreenRecoveryScene,
  assessmentId: string,
  index = 0,
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(
    scene.notice.intake.copyright_notice_id,
  )
  const target = aggregate!.targets[index]!
  return seedCopyrightStatementRestriction({
    noticeId: scene.notice.intake.copyright_notice_id,
    targetId: target.id,
    assessmentId,
    revision: target.placement_revision,
    moderatorId: scene.moderator.id,
    automated: true,
  })
}

/** All effects of a committed rejection precede independent queue/projection/replay subjects. */
export async function seedScreenRecoveryRejectedEffect(scene: ScreenRecoveryScene) {
  await using query = await beginTransaction()
  const { rows } = await query<{
    previous: string | null
    reviewed_at: Date
  }>(sql`/* seedScreenRecoveryRejectedEffect:review */
    SELECT submission.current_assessment_identity_id AS previous, review.reviewed_at
    FROM copyright_notice_form_intake_reviews review JOIN copyright_notice_form_intakes intake
      ON intake.id = review.copyright_notice_form_intake_id
    JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    WHERE intake.id = ${scene.notice.intake.id}`)
  if (!rows[0]) throw new Error('Owned rejected form review missing')
  const assessmentId = await persistRecoveredCopyrightAssessment(
    query,
    scene.notice.intake.copyright_notice_id,
    scene.notice.intake.copyright_notice_submission_id,
    rows[0].reviewed_at,
    scene.moderator.id,
    rows[0].previous,
  )
  await recordClaimantMisuseEvent(query, {
    noticeId: scene.notice.intake.copyright_notice_id,
    recordedAt: rows[0].reviewed_at,
    event: { outcome: 'notice_rejected', assessmentId },
  })
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId: scene.notice.intake.copyright_notice_id, event: 'not_accepted' },
    query,
  )
  await reverseAutomatedCopyrightRestrictionsInTransaction(query, {
    noticeId: scene.notice.intake.copyright_notice_id,
    submissionId: scene.notice.intake.copyright_notice_submission_id,
    moderatorId: scene.moderator.id,
    reviewedAt: rows[0].reviewed_at,
  })
  await query.commit()
}
