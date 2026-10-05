import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { decryptCopyrightText, liveCopyrightCiphertext } from './erased-ciphertext.mts'
import { parseCopyrightFormGuidance } from './form-screening-guidance.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

export async function selectStaffTargets(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
) {
  const { rows } = await query<CopyrightStaffCase['targets'][number]>(
    sql`/* getPendingCopyrightStaffCase:targets */
      SELECT target.id, concat('image-placement:', target.placement_id) AS placement_key,
        target.placement_revision, image.image_id, target.hosted_use_url,
        COALESCE(surface.surface_kind, 'post-image') AS surface,
        CASE WHEN activation.placement_id IS NULL THEN NULL ELSE jsonb_build_object(
          'set_by_id', activation.bound_by_user_id,
          'set_by_administrator', activation.bound_by_administrator,
          'uploaded_by_id', activation.uploaded_by_user_id
        ) END AS provenance
      FROM copyright_notice_targets target JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
      LEFT JOIN image_surface_placements surface ON surface.placement_id = target.placement_id
      LEFT JOIN LATERAL (
        SELECT recorded.placement_id, recorded.bound_by_user_id, recorded.bound_by_administrator,
          recorded.uploaded_by_user_id
        FROM image_surface_placement_activations recorded
        WHERE recorded.placement_id = target.placement_id
          AND recorded.placement_revision = target.surface_activation_revision
      ) activation ON true
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

/**
 * The case's form intake with its screening and guidance, whether or not a moderator has reviewed
 * it, so later reviewers still see what the reviewer saw. `review` is the recorded decision, or
 * null while the intake awaits one.
 */
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
    guidance_ciphertext: string | null
    review_accepted: boolean | null
    reviewed_at: Date | null
    reviewed_by_id: string | null
  }>(sql`/* getPendingCopyrightStaffCase:formReview */
    SELECT intake.id AS intake_id, submission.source_kind, execution.state, screening.recommendation, screening.rationale_ciphertext, screening.guidance_ciphertext,
      review.accepted AS review_accepted, review.reviewed_at, review.reviewed_by_id
    FROM copyright_notice_form_intakes intake JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    LEFT JOIN LATERAL (SELECT * FROM copyright_notice_form_screening_attempts attempt WHERE attempt.copyright_notice_form_intake_id = intake.id ORDER BY attempt.attempt_number DESC LIMIT 1) execution ON true
    LEFT JOIN copyright_notice_form_screenings screening ON screening.id = execution.copyright_notice_form_screening_id AND execution.state = 'completed'
    LEFT JOIN copyright_notice_form_intake_reviews review ON review.copyright_notice_form_intake_id = intake.id
    WHERE intake.copyright_notice_id = ${noticeId}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const purpose = `copyright-form-screening:${row.intake_id}`
  const guidance = liveCopyrightCiphertext(row.guidance_ciphertext)
  return {
    intake_id: row.intake_id,
    source_kind: row.source_kind,
    screening: row.state
      ? {
          state: row.state,
          recommendation: row.recommendation,
          rationale: row.rationale_ciphertext
            ? decryptCopyrightText(row.rationale_ciphertext, purpose)
            : null,
          guidance: guidance
            ? parseCopyrightFormGuidance(JSON.parse(decryptSecret(guidance, purpose)))
            : null,
        }
      : null,
    review:
      row.review_accepted === null || row.reviewed_at === null
        ? null
        : {
            accepted: row.review_accepted,
            reviewed_at: row.reviewed_at,
            reviewed_by_id: row.reviewed_by_id,
          },
  }
}
