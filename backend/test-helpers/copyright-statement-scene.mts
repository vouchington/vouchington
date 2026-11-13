import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { createTestUser } from './index.mts'
import {
  createSignedInCopyrightForm,
  type FormPeople,
} from './services/copyright-notices/screened-form.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { testCopyrightFormGuidance } from './services/copyright-notices/form-guidance.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'

/** Post-decision participant/statement subjects always start with complete, committed authority. */
export async function createCommittedCopyrightStatementScene(
  people: FormPeople = {},
  options: { accepted?: boolean; automated?: boolean } = {},
) {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const notice = await createSignedInCopyrightForm(1, people)
  const screeningId = options.automated ? await seedStatementScreening(notice.intake.id) : undefined
  const accepted = options.accepted ?? true
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: options.automated ? null : moderator,
    substantiallyCompliant: accepted,
    ...(screeningId ? { copyrightFormScreeningId: screeningId } : {}),
  })
  if (!options.automated) {
    await using transaction = await beginTransaction()
    await transaction(sql`/* createCommittedCopyrightStatementScene:review */
      INSERT INTO copyright_notice_form_intake_reviews (copyright_notice_form_intake_id,
        reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
      VALUES (${notice.intake.id}, CURRENT_TIMESTAMP, ${moderator.id}, ${accepted},
        ${encryptSecret(accepted ? 'Complete notice.' : 'Incomplete notice.', `copyright-form-review:${notice.intake.id}`)})`)
    await transaction.commit()
  }
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
  const target = aggregate?.targets[0]
  if (!target) throw new Error('Committed statement target disappeared')
  const restriction = accepted
    ? await seedCopyrightStatementRestriction({
        noticeId: notice.intake.copyright_notice_id,
        targetId: target.id,
        assessmentId: assessment.id,
        revision: target.placement_revision,
        moderatorId: moderator.id,
        automated: options.automated,
      })
    : null
  return { notice, moderator, target, restriction }
}

/** A projection fixture owns a current completed screen, not a competing screening-worker request. */
async function seedStatementScreening(intakeId: string) {
  await using transaction = await beginTransaction()
  const purpose = `copyright-form-screening:${intakeId}`
  const { rows } = await transaction<{ id: string }>(sql`/* seedStatementScreening */
    INSERT INTO copyright_notice_form_screenings (copyright_notice_form_intake_id, input_sha256,
      prompt_version, model, recommendation, rationale_ciphertext, guidance_ciphertext)
    VALUES (${intakeId}, ${Buffer.alloc(32, 1)}, 'copyright-form-screening-v2', 'test-model',
      'not_obviously_invalid', ${encryptSecret('No obvious spam markers.', purpose)},
      ${encryptSecret(JSON.stringify(testCopyrightFormGuidance), purpose)}) RETURNING id`)
  const id = rows[0]!.id
  const { rowCount } = await transaction(sql`/* seedStatementScreening:execution */
    UPDATE copyright_notice_form_screening_attempts SET copyright_notice_form_screening_id = ${id},
      completed_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${intakeId} AND attempt_number = 1 AND state = 'pending'`)
  if (rowCount !== 1)
    throw new Error('Owned statement screen did not complete its current execution')
  await transaction.commit()
  return id
}
