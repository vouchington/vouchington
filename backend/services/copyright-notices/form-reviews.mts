import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

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
    screening_recommendation: string | null
  }>(sql`/* reviewCopyrightFormIntake:intake */
    SELECT intake.copyright_notice_id AS notice_id,
      intake.copyright_notice_submission_id AS submission_id, submission.source_kind,
      (SELECT screening.recommendation
       FROM copyright_notice_form_screenings screening
       WHERE screening.copyright_notice_form_intake_id = intake.id
       ORDER BY screening.id DESC LIMIT 1) AS screening_recommendation
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    WHERE intake.id = ${input.intakeId}
  `)
  const intake = rows[0]
  assert(intake, 404, 'Copyright form intake not found')
  assert(
    intake.source_kind === 'guest_form' ||
      (intake.source_kind === 'signed_in_form' &&
        (!input.accepted ||
          intake.screening_recommendation === null ||
          intake.screening_recommendation === 'invalid_or_spam')),
    422,
    'Only guest forms and signed-in forms without a clear anti-spam result require moderator review',
  )
  const { rows: reviewRows } = await transaction<{ accepted: boolean }>(
    sql`/* reviewCopyrightFormIntake:existing */
      SELECT accepted FROM copyright_notice_form_intake_reviews
      WHERE copyright_notice_form_intake_id = ${input.intakeId}`,
  )
  const existing = reviewRows[0]
  assert(!existing || existing.accepted === input.accepted, 409, 'Form intake was already reviewed')
  if (!existing) {
    await transaction(sql`/* reviewCopyrightFormIntake:review */
      INSERT INTO copyright_notice_form_intake_reviews (
        copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
      ) VALUES (
        ${input.intakeId}, ${new Date()}, ${input.currentUser.id}, ${input.accepted},
        ${encryptSecret(input.rationale, `copyright-form-review:${input.intakeId}`)}
      )
    `)
  }
  await transaction.commit()
  const assessmentId = await getOrCreateHumanAssessment(
    intake.submission_id,
    input.currentUser,
    input.accepted,
  )
  if (input.accepted) {
    await applyMissingRestrictions(intake.notice_id, assessmentId, input.currentUser.id)
  } else {
    await reverseAutomatedRestrictions(intake.notice_id, intake.submission_id, input.currentUser.id)
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
): Promise<string> {
  const existing = await getCurrentAssessment(submissionId)
  if (existing?.substantially_compliant === accepted) return existing.id
  if (existing) {
    assert(!accepted, 409, 'Submission was already assessed')
    return (
      await appendCopyrightSubmissionAssessment({
        submissionId,
        assessedAt: new Date(),
        currentUser,
        substantiallyCompliant: false,
        supersedesAssessmentId: existing.id,
      })
    ).id
  }
  try {
    return (
      await appendCopyrightSubmissionAssessment({
        submissionId,
        assessedAt: new Date(),
        currentUser,
        substantiallyCompliant: accepted,
      })
    ).id
  } catch (error) {
    if (!isConflict(error)) throw error
    const raced = await getCurrentAssessment(submissionId)
    assert(raced?.substantially_compliant === accepted, 409, 'Submission was already assessed')
    return raced.id
  }
}

async function getCurrentAssessment(
  submissionId: string,
): Promise<{ id: string; substantially_compliant: boolean } | null> {
  const { rows } = await write<{ id: string; substantially_compliant: boolean }>(
    sql`/* reviewCopyrightFormIntake:assessment */
      SELECT assessment.id, assessment.substantially_compliant
      FROM copyright_notice_submission_assessments assessment
      WHERE assessment.copyright_notice_submission_id = ${submissionId}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id
        )`,
  )
  return rows[0] ?? null
}

async function applyMissingRestrictions(
  noticeId: string,
  assessmentId: string,
  moderatorId: string,
): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`/* reviewCopyrightFormIntake:targets */
    SELECT target.id FROM copyright_notice_targets target
    WHERE target.copyright_notice_id = ${noticeId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_target_id = target.id AND restriction.lifted_at IS NULL
      )
  `)
  await Promise.all(
    rows.map(target =>
      acceptCopyrightNoticeAndImposeRestriction({
        noticeId,
        targetId: target.id,
        assessmentId,
        imposedAt: new Date(),
        imposedById: moderatorId,
      }),
    ),
  )
}

async function reverseAutomatedRestrictions(
  noticeId: string,
  submissionId: string,
  moderatorId: string,
): Promise<void> {
  const reviewedAt = new Date()
  await write(sql`/* reviewCopyrightFormIntake:reverseAutomatedRestrictions */
    UPDATE copyright_restrictions restriction
    SET human_reviewed_at = COALESCE(restriction.human_reviewed_at, ${reviewedAt}),
      human_review_action = COALESCE(restriction.human_review_action, 'reverse'),
      human_reviewed_by_id = CASE
        WHEN restriction.human_reviewed_at IS NULL THEN ${moderatorId}
        ELSE restriction.human_reviewed_by_id
      END,
      lifted_at = COALESCE(restriction.lifted_at, ${reviewedAt}),
      lifted_by_id = CASE WHEN restriction.lifted_at IS NULL THEN ${moderatorId} ELSE restriction.lifted_by_id END
    FROM copyright_notice_submission_assessments assessment
    CROSS JOIN copyright_notice_targets target
    WHERE restriction.authorizing_assessment_id = assessment.id
      AND target.id = restriction.copyright_notice_target_id
      AND assessment.copyright_notice_submission_id = ${submissionId}
      AND assessment.assessed_by_id IS NULL
      AND target.copyright_notice_id = ${noticeId}
      AND restriction.lifted_at IS NULL
  `)
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 409
  )
}
