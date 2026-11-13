import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Current completed screening and automatic assessment precede the real mandatory review. */
export async function createAutomatedStaydownNotice() {
  const [claimant, moderator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const { notice, screeningId } = await createClearScreenedForm(1, { claimant, poster: claimant })
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
  if (!target) throw new Error('Owned automated staydown target missing')
  const restriction = await seedCopyrightStatementRestriction({
    noticeId,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: moderator.id,
    automated: true,
    reviewed: false,
  })
  const { rows } = await write<{
    automated: boolean
    screening_id: string
    assessed_by: string | null
    imposed_by: string | null
    reviewed_at: Date | null
    current: boolean
  }>(sql`/* createAutomatedStaydownNotice:authority */
    SELECT restriction.is_authorizing_assessment_automated AS automated,
      assessment.copyright_notice_form_screening_id AS screening_id, assessment.assessed_by_id AS assessed_by,
      restriction.imposed_by_id AS imposed_by, restriction.human_reviewed_at AS reviewed_at,
      submission.current_assessment_identity_id = assessment.id AND
        fn_current_copyright_form_screening(submission.id, assessment.copyright_notice_form_screening_id) AS current
    FROM copyright_restrictions restriction
    JOIN copyright_notice_submissions submission ON submission.id = ${notice.intake.copyright_notice_submission_id}
    JOIN copyright_notice_submission_assessments assessment ON assessment.id = restriction.authorizing_assessment_id
    WHERE restriction.id = ${restriction.id} AND submission.copyright_notice_id = ${noticeId}`)
  const authority = rows[0]
  if (
    !authority?.automated ||
    authority.screening_id !== screeningId ||
    !authority.current ||
    authority.assessed_by !== null ||
    authority.imposed_by !== null ||
    authority.reviewed_at !== null
  )
    throw new Error(
      'Automated staydown fixture lacks current screening-backed unreviewed authority',
    )
  return {
    noticeId,
    claimant,
    moderator,
    screeningId,
    authority,
    owners: { [claimant.id]: [target.id] },
    restrictions: [
      {
        id: restriction.id,
        targetId: target.id,
        imageId: target.image_id,
        revision: target.placement_revision,
      },
    ],
  }
}
