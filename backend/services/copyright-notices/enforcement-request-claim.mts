import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type EnforcementRequest = {
  assessment_id: string
  notice_id: string
  imposed_by_id: string | null
}

type EnforcementRequestClaim = EnforcementRequest | 'completed' | null

export async function claimCopyrightEnforcementRequest(
  assessmentId: string,
): Promise<EnforcementRequestClaim> {
  const { rows } = await write<{
    assessment_id: string
    notice_id: string | null
    imposed_by_id: string | null
    terminalized: boolean
  }>(sql`/* claimCopyrightEnforcementRequest */
    WITH enforceable AS (
      SELECT request.copyright_notice_submission_assessment_id AS assessment_id
      FROM copyright_notice_enforcement_requests request
      JOIN copyright_notice_submission_assessments assessment
        ON assessment.id = request.copyright_notice_submission_assessment_id
      JOIN copyright_notice_submissions submission
        ON submission.id = assessment.copyright_notice_submission_id
      WHERE request.copyright_notice_submission_assessment_id = ${assessmentId}
        AND submission.copyright_notice_id = request.copyright_notice_id
        AND submission.kind = 'notice'
        AND assessment.substantially_compliant
        AND (submission.source_kind = 'signed_in_form' OR assessment.assessed_by_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM copyright_notice_form_intakes intake
          JOIN copyright_notice_form_intake_reviews review
            ON review.copyright_notice_form_intake_id = intake.id
          WHERE intake.copyright_notice_submission_id = assessment.copyright_notice_submission_id
            AND NOT review.accepted
        )
        AND NOT EXISTS (
          SELECT 1
          FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id
        )
    ), terminalized AS (
      UPDATE copyright_notice_enforcement_requests request
      SET state = 'completed', claimed_at = NULL, completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE request.copyright_notice_submission_assessment_id = ${assessmentId}
        AND (request.state = 'pending'
          OR (request.state = 'claimed'
            AND request.claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
        AND NOT EXISTS (
          SELECT 1
          FROM enforceable
          WHERE assessment_id = request.copyright_notice_submission_assessment_id
        )
      RETURNING request.copyright_notice_submission_assessment_id AS assessment_id
    ), claimed AS (
      UPDATE copyright_notice_enforcement_requests request
      SET state = 'claimed', claimed_at = CURRENT_TIMESTAMP,
        last_attempt_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE request.copyright_notice_submission_assessment_id = ${assessmentId}
        AND (request.state = 'pending'
          OR (request.state = 'claimed'
            AND request.claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
        AND EXISTS (
          SELECT 1
          FROM enforceable
          WHERE assessment_id = request.copyright_notice_submission_assessment_id
        )
      RETURNING request.copyright_notice_submission_assessment_id AS assessment_id,
        request.copyright_notice_id AS notice_id, request.imposed_by_id
    )
    SELECT assessment_id, NULL::uuid AS notice_id, NULL::uuid AS imposed_by_id, true AS terminalized
    FROM terminalized
    UNION ALL
    SELECT assessment_id, notice_id, imposed_by_id, false AS terminalized
    FROM claimed
  `)
  const claim = rows[0]
  if (!claim) return null
  if (claim.terminalized) return 'completed'
  if (!claim.notice_id) throw new Error('Claimed copyright enforcement request has no notice')
  return {
    assessment_id: claim.assessment_id,
    notice_id: claim.notice_id,
    imposed_by_id: claim.imposed_by_id,
  }
}

export async function completeNonEnforceableCopyrightEnforcementRequest(
  assessmentId: string,
): Promise<boolean> {
  const { rows } = await write(sql`/* completeNonEnforceableCopyrightEnforcementRequest */
    UPDATE copyright_notice_enforcement_requests request
    SET state = 'completed', claimed_at = NULL, completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE request.copyright_notice_submission_assessment_id = ${assessmentId}
      AND request.state = 'claimed'
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_submission_assessments assessment
        JOIN copyright_notice_submissions submission
          ON submission.id = assessment.copyright_notice_submission_id
        WHERE assessment.id = request.copyright_notice_submission_assessment_id
          AND submission.copyright_notice_id = request.copyright_notice_id
          AND submission.kind = 'notice'
          AND assessment.substantially_compliant
          AND (submission.source_kind = 'signed_in_form' OR assessment.assessed_by_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1
            FROM copyright_notice_form_intakes intake
            JOIN copyright_notice_form_intake_reviews review
              ON review.copyright_notice_form_intake_id = intake.id
            WHERE intake.copyright_notice_submission_id = assessment.copyright_notice_submission_id
              AND NOT review.accepted
          )
          AND NOT EXISTS (
            SELECT 1
            FROM copyright_notice_submission_assessments newer
            WHERE newer.supersedes_assessment_id = assessment.id
          )
      )
    RETURNING request.copyright_notice_submission_assessment_id
  `)
  return rows.length > 0
}
