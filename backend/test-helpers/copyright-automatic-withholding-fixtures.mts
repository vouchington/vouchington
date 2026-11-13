import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import {
  readAutomaticWithholdingState,
  type AutomaticNotice,
} from './copyright-automatic-withholding-state.mts'
import type { AutomaticWithholdingRefusalReason } from '../services/copyright-notices/automatic-withholding-gates.mts'

/** A committed true automated assessment, current screening and provisional restriction precede a cap read. */
export async function seedCommittedAutomaticWithholding(notice: AutomaticNotice) {
  const before = await readAutomaticWithholdingState(notice)
  if (before.assessors.length || before.refusals.length || before.reviews.length)
    throw new Error('Owned automatic setup already has a decision')
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: null,
    substantiallyCompliant: true,
    copyrightFormScreeningId: before.screeningId,
  })
  const target = before.effective.state.targets[0]!
  await seedCopyrightStatementRestriction({
    noticeId: notice.intake.copyright_notice_id,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: (await createTestUser({ extraRoles: ['moderator'] })).id,
    automated: true,
    reviewed: false,
  })
  return assessment
}

/** Post-refusal gate/replay/dispatch subjects always start with the complete sticky source fact. */
export async function seedCommittedAutomaticRefusal(
  notice: AutomaticNotice,
  reason: AutomaticWithholdingRefusalReason,
) {
  const before = await readAutomaticWithholdingState(notice)
  if (before.assessors.length || before.refusals.length || before.reviews.length)
    throw new Error('Owned refused setup already has a decision')
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedAutomaticRefusal */ INSERT INTO copyright_automatic_withholding_refusals
    (copyright_notice_submission_id, reason, refused_at)
    VALUES (${notice.intake.copyright_notice_submission_id}, ${reason}, ${new Date()})`)
  await transaction.commit()
}
