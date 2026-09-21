import { encryptSecret } from '@modules/token-secrets'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

export type CopyrightFormScreeningRecommendation = 'not_obviously_invalid' | 'invalid_or_spam'
/** @public Cross-workspace persistence boundary used by the copyright form-screening agent. */
export async function appendCopyrightFormScreening(input: {
  intakeId: string
  inputSha256: Buffer
  recommendation: CopyrightFormScreeningRecommendation
  rationale: string
  promptVersion: string
  model: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* appendCopyrightFormScreening */
    INSERT INTO copyright_notice_form_screenings (copyright_notice_form_intake_id, input_sha256, prompt_version, model, recommendation, rationale_ciphertext)
    SELECT ${input.intakeId}, ${input.inputSha256}, ${input.promptVersion}, ${input.model}, ${input.recommendation},
      ${encryptSecret(input.rationale, `copyright-form-screening:${input.intakeId}`)}
    ON CONFLICT (copyright_notice_form_intake_id, input_sha256, prompt_version) DO NOTHING
    RETURNING id
  `)
  if (rows[0]) return rows[0].id
  const { rows: existing } = await write<{
    id: string
  }>(sql`/* appendCopyrightFormScreening:existing */
    SELECT id FROM copyright_notice_form_screenings
    WHERE copyright_notice_form_intake_id = ${input.intakeId}
      AND input_sha256 = ${input.inputSha256} AND prompt_version = ${input.promptVersion}
  `)
  if (!existing[0]) throw new Error('Copyright form screening conflict has no stored result')
  return existing[0].id
}
/** Workflow-owned automation gate. Agents only return a recommendation; they cannot call this. */
export async function applyNonSpamSignedInCopyrightFormScreening(
  submissionId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows: intakeIdRows } = await transaction<{ id: string }>(
    sql`/* applyNonSpamSignedInCopyrightFormScreening:intakeId */
      SELECT id FROM copyright_notice_form_intakes
      WHERE copyright_notice_submission_id = ${submissionId}`,
  )
  const intakeId = intakeIdRows[0]?.id
  if (!intakeId) {
    await transaction.commit()
    return
  }
  await transaction(sql`/* applyNonSpamSignedInCopyrightFormScreening:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${intakeId}`}, 0))
  `)
  const { rows } = await transaction<{
    intake_id: string
    notice_id: string
    screening_id: string
    source_kind: 'signed_in_form' | 'guest_form'
    form_review_accepted: boolean | null
    statutory_fields_complete: boolean
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening */
    SELECT intake.id AS intake_id, intake.copyright_notice_id AS notice_id, submission.source_kind,
      (SELECT screening.id FROM copyright_notice_form_screenings screening
       WHERE screening.copyright_notice_form_intake_id = intake.id
       ORDER BY screening.id DESC LIMIT 1) AS screening_id,
      review.accepted AS form_review_accepted,
      notice.jurisdiction = 'us_dmca'
        AND char_length(notice.claimant_contact_ciphertext) > 0
        AND char_length(btrim(notice.work_description)) > 0
        AND intake.good_faith_belief
        AND intake.accuracy_authority_under_penalty_of_perjury
        AND char_length(intake.electronic_signature_ciphertext) > 0
        AND EXISTS (
          SELECT 1 FROM copyright_notice_targets target
          JOIN copyright_notice_target_images target_image
            ON target_image.copyright_notice_target_id = target.id
          WHERE target.copyright_notice_id = intake.copyright_notice_id
            AND char_length(btrim(target.hosted_use_url)) > 0
        )
        AND EXISTS (
          SELECT 1
          FROM copyright_notice_delivery_intents receipt
          JOIN copyright_notice_delivery_recipients recipient
            ON recipient.copyright_notice_delivery_intent_id = receipt.id
          WHERE receipt.copyright_notice_id = intake.copyright_notice_id
            AND receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
            AND receipt.delivery_kind = 'claimant_receipt'
        ) AS statutory_fields_complete
    FROM copyright_notice_form_intakes intake JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    LEFT JOIN copyright_notice_form_intake_reviews review
      ON review.copyright_notice_form_intake_id = intake.id
    WHERE submission.id = ${submissionId}
      AND (
        SELECT screening.recommendation
        FROM copyright_notice_form_screenings screening
        WHERE screening.copyright_notice_form_intake_id = intake.id
        ORDER BY screening.id DESC
        LIMIT 1
      ) = 'not_obviously_invalid'
  `)
  const intake = rows[0]
  if (
    !intake ||
    intake.source_kind !== 'signed_in_form' ||
    intake.form_review_accepted !== null ||
    !intake.statutory_fields_complete
  ) {
    await transaction.commit()
    return
  }
  const { rows: existingAssessments } = await write<{
    id: string
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening:existingAssessment */
    SELECT id FROM copyright_notice_submission_assessments
    WHERE copyright_notice_submission_id = ${submissionId}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessments newer WHERE newer.supersedes_assessment_id = copyright_notice_submission_assessments.id)
  `)
  const assessment =
    existingAssessments[0] ??
    (await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: intake.screening_id,
    }))
  const { rows: targets } = await write<{
    id: string
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening:targets */
    SELECT target.id FROM copyright_notice_targets target
    WHERE target.copyright_notice_id = ${intake.notice_id}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_target_id = target.id AND restriction.lifted_at IS NULL
      )
  `)
  await Promise.all(
    targets.map(target =>
      acceptCopyrightNoticeAndImposeRestriction({
        noticeId: intake.notice_id,
        targetId: target.id,
        assessmentId: assessment.id,
        imposedAt: new Date(),
        imposedById: null,
      }),
    ),
  )
  await transaction.commit()
}
