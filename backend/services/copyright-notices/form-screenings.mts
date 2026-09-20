import { encryptSecret } from '@modules/token-secrets'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

export type CopyrightFormScreeningRecommendation = 'not_obviously_invalid' | 'invalid_or_spam'
/** @public Cross-workspace read boundary used by the copyright form-screening agent. */
export async function getCopyrightFormIntakeForScreening(submissionId: string): Promise<{
  intakeId: string
  sourceKind: 'signed_in_form' | 'guest_form'
  statutoryFieldsComplete: boolean
  workDescription: string
} | null> {
  const { rows } = await write<{
    id: string
    source_kind: 'signed_in_form' | 'guest_form'
    work_description: string
    good_faith_belief: boolean
    accuracy_authority_under_penalty_of_perjury: boolean
    has_electronic_signature: boolean
  }>(sql`/* getCopyrightFormIntakeForScreening */
    SELECT intake.id, submission.source_kind, notice.work_description,
      intake.good_faith_belief, intake.accuracy_authority_under_penalty_of_perjury,
      char_length(intake.electronic_signature_ciphertext) > 0 AS has_electronic_signature
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    WHERE intake.copyright_notice_submission_id = ${submissionId}
  `)
  const row = rows[0]
  if (!row) return null
  return {
    intakeId: row.id,
    sourceKind: row.source_kind,
    statutoryFieldsComplete:
      row.good_faith_belief &&
      row.accuracy_authority_under_penalty_of_perjury &&
      row.has_electronic_signature,
    workDescription: row.work_description,
  }
}
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
  const { rows } = await write<{
    intake_id: string
    notice_id: string
    screening_id: string
    source_kind: 'signed_in_form' | 'guest_form'
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening */
    SELECT intake.id AS intake_id, intake.copyright_notice_id AS notice_id, submission.source_kind,
      (SELECT screening.id FROM copyright_notice_form_screenings screening
       WHERE screening.copyright_notice_form_intake_id = intake.id
       ORDER BY screening.id DESC LIMIT 1) AS screening_id
    FROM copyright_notice_form_intakes intake JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
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
  if (!intake || intake.source_kind !== 'signed_in_form') return
  const { rows: existingAssessments } = await write<{
    id: string
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening:existingAssessment */
    SELECT id FROM copyright_notice_submission_assessments
    WHERE copyright_notice_submission_id = ${submissionId}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessments newer WHERE newer.supersedes_assessment_id = copyright_notice_submission_assessments.id)
  `)
  const assessment =
    existingAssessments[0] ??
    (await createAutomatedAssessment({
      submissionId,
      noticeId: intake.notice_id,
      screeningId: intake.screening_id,
    }))
  if (!assessment) return
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
}

async function createAutomatedAssessment(input: {
  submissionId: string
  noticeId: string
  screeningId: string
}): Promise<{ id: string } | null> {
  try {
    return await appendCopyrightSubmissionAssessment({
      submissionId: input.submissionId,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: input.screeningId,
    })
  } catch (error) {
    if (!isCurrentAssessmentConflict(error)) throw error
    const { rows } = await write<{ id: string }>(sql`/* createAutomatedAssessment:concurrent */
      SELECT assessment.id
      FROM copyright_notice_submission_assessments assessment
      JOIN copyright_notice_submissions submission
        ON submission.id = assessment.copyright_notice_submission_id
      WHERE submission.id = ${input.submissionId}
        AND submission.copyright_notice_id = ${input.noticeId}
        AND assessment.assessed_by_id IS NULL
        AND assessment.substantially_compliant
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id
        )
    `)
    return rows[0] ?? null
  }
}

function isCurrentAssessmentConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 409
  )
}
