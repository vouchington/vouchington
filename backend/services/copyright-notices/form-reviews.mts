import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from './compliance.mts'
import { processCopyrightEnforcementRequest } from './enforcement-requests.mts'
import { reverseAutomatedCopyrightRestrictions } from './form-reviews-reversal.mts'

export async function reviewCopyrightFormIntake(input: {
  intakeId: string
  currentUser: PrivateUser
  accepted: boolean
  rationale: string
}): Promise<{ noticeId: string; submissionId: string; accepted: boolean }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  await using transaction = await beginTransaction()
  await transaction(sql`/* reviewCopyrightFormIntake:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${input.intakeId}`}, 0))
  `)
  const { rows } = await transaction<{
    notice_id: string
    submission_id: string
    source_kind: string
    current_screening_authority: boolean
  }>(sql`/* reviewCopyrightFormIntake:intake */
    SELECT intake.copyright_notice_id AS notice_id,
      intake.copyright_notice_submission_id AS submission_id, submission.source_kind,
      EXISTS (SELECT 1 FROM copyright_notice_form_screening_executions execution
        WHERE execution.copyright_notice_form_intake_id = intake.id
          AND fn_current_copyright_form_screening(submission.id,
            execution.copyright_notice_form_screening_id)) AS current_screening_authority
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    WHERE intake.id = ${input.intakeId}
  `)
  const intake = rows[0]
  assert(intake, 404, 'Copyright form intake not found')
  const { rows: reviewRows } = await transaction<{ accepted: boolean }>(
    sql`/* reviewCopyrightFormIntake:existing */
      SELECT accepted FROM copyright_notice_form_intake_reviews
      WHERE copyright_notice_form_intake_id = ${input.intakeId}`,
  )
  const existing = reviewRows[0]
  assert(!existing || existing.accepted === input.accepted, 409, 'Form intake was already reviewed')
  if (!existing) {
    assert(
      intake.source_kind === 'guest_form' ||
        (intake.source_kind === 'signed_in_form' &&
          (!input.accepted || !intake.current_screening_authority)),
      422,
      'Only guest forms and signed-in forms without a clear anti-spam result require moderator review',
    )
    await transaction(sql`/* reviewCopyrightFormIntake:review */
      INSERT INTO copyright_notice_form_intake_reviews (
        copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
      ) VALUES (
        ${input.intakeId}, ${new Date()}, ${input.currentUser.id}, ${input.accepted},
        ${encryptSecret(input.rationale, `copyright-form-review:${input.intakeId}`)}
      )
    `)
  }
  const assessmentId = await getOrCreateHumanAssessment(
    intake.submission_id,
    input.currentUser,
    input.accepted,
    transaction,
  )
  await transaction.commit()
  if (input.accepted) {
    await processCopyrightEnforcementRequest(assessmentId)
  } else {
    await reverseAutomatedCopyrightRestrictions(
      intake.notice_id,
      intake.submission_id,
      input.currentUser.id,
    )
  }
  return {
    noticeId: intake.notice_id,
    submissionId: intake.submission_id,
    accepted: input.accepted,
  }
}

async function getOrCreateHumanAssessment(
  submissionId: string,
  currentUser: PrivateUser,
  accepted: boolean,
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<string> {
  const existing = await getCurrentAssessment(submissionId, transaction)
  if (
    existing?.copyright_notice_form_screening_id === null &&
    existing.substantially_compliant === accepted
  )
    return existing.id
  assert(
    !existing || !accepted || existing.copyright_notice_form_screening_id !== null,
    409,
    'Submission was already assessed',
  )
  return (
    await appendCopyrightSubmissionAssessmentInTransaction(
      {
        submissionId,
        assessedAt: new Date(),
        currentUser,
        substantiallyCompliant: accepted,
        supersedesAssessmentId: existing?.id,
      },
      transaction,
    )
  ).id
}

async function getCurrentAssessment(
  submissionId: string,
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<{
  id: string
  substantially_compliant: boolean
  copyright_notice_form_screening_id: string | null
} | null> {
  const { rows } = await transaction<{
    id: string
    substantially_compliant: boolean
    copyright_notice_form_screening_id: string | null
  }>(
    sql`/* reviewCopyrightFormIntake:assessment */
      SELECT assessment.id, assessment.substantially_compliant, assessment.copyright_notice_form_screening_id
      FROM copyright_notice_submission_assessments assessment
      WHERE assessment.copyright_notice_submission_id = ${submissionId}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id
        )`,
  )
  return rows[0] ?? null
}
