import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { CopyrightStaffCase } from './read-models-staff.mts'

export async function selectStaffTargets(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
) {
  const { rows } = await query<CopyrightStaffCase['targets'][number]>(
    sql`/* getPendingCopyrightStaffCase:targets */
      SELECT target.id, concat('image-placement:', target.placement_id) AS placement_key, target.placement_revision, image.image_id, target.hosted_use_url
      FROM copyright_notice_targets target JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
      WHERE target.copyright_notice_id = ${noticeId} ORDER BY target.id
    `,
  )
  return rows
}

export async function selectStaffEvidence(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
) {
  const { rows } = await query<{
    id: string
    submission_id: string
    mime_type: string
    byte_size: number
    sha256: Buffer
  }>(sql`/* getPendingCopyrightStaffCase:evidence */
    SELECT artifact.id, artifact.copyright_notice_submission_id AS submission_id, artifact.mime_type, artifact.byte_size, artifact.sha256
    FROM copyright_notice_evidence_artifacts artifact JOIN copyright_notice_submissions submission ON submission.id = artifact.copyright_notice_submission_id
    WHERE submission.copyright_notice_id = ${noticeId} ORDER BY artifact.id
  `)
  return rows.map(row => ({ ...row, sha256: row.sha256.toString('hex') }))
}

export async function selectStaffFormReview(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightStaffCase['form_review']> {
  const { rows } = await query<{
    intake_id: string
    source_kind: string
    state: 'pending' | 'failed' | 'completed' | null
    recommendation: string | null
    rationale_ciphertext: string | null
  }>(sql`/* getPendingCopyrightStaffCase:formReview */
    SELECT intake.id AS intake_id, submission.source_kind, execution.state, screening.recommendation, screening.rationale_ciphertext
    FROM copyright_notice_form_intakes intake JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    LEFT JOIN copyright_notice_form_screening_executions execution ON execution.copyright_notice_form_intake_id = intake.id
    LEFT JOIN copyright_notice_form_screenings screening ON screening.id = execution.copyright_notice_form_screening_id AND execution.state = 'completed'
    LEFT JOIN copyright_notice_form_intake_reviews review ON review.copyright_notice_form_intake_id = intake.id
    WHERE intake.copyright_notice_id = ${noticeId} AND review.id IS NULL
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  return {
    intake_id: row.intake_id,
    source_kind: row.source_kind,
    screening: row.state
      ? {
          state: row.state,
          recommendation: row.recommendation,
          rationale: row.rationale_ciphertext
            ? decryptSecret(row.rationale_ciphertext, `copyright-form-screening:${row.intake_id}`)
            : null,
        }
      : null,
  }
}
