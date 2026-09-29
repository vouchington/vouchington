import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockAssessmentForm } from './compliance.mts'

export type EnforcementRequest = {
  assessment_id: string
  notice_id: string
  imposed_by_id: string | null
}

type EnforcementRequestClaim = EnforcementRequest | 'completed' | null

export async function claimCopyrightEnforcementRequest(
  assessmentId: string,
): Promise<EnforcementRequestClaim> {
  await using transaction = await beginTransaction()
  await lockEnforcementForm(assessmentId, transaction)
  const { rows } = await transaction<{
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
        AND (assessment.copyright_notice_form_screening_id IS NULL OR
          fn_current_copyright_form_screening(submission.id, assessment.copyright_notice_form_screening_id))
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
  await transaction.commit()
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
  await using transaction = await beginTransaction()
  await lockEnforcementForm(assessmentId, transaction)
  const { rows } = await transaction(sql`/* completeNonEnforceableCopyrightEnforcementRequest */
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
          AND (assessment.copyright_notice_form_screening_id IS NULL OR
            fn_current_copyright_form_screening(submission.id, assessment.copyright_notice_form_screening_id))
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
  await transaction.commit()
  return rows.length > 0
}

async function lockEnforcementForm(
  assessmentId: string,
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const { rows } = await transaction<{
    copyright_notice_submission_id: string
  }>(sql`/* lockEnforcementForm */
    SELECT copyright_notice_submission_id FROM copyright_notice_submission_assessments WHERE id = ${assessmentId}
  `)
  if (rows[0]) await lockAssessmentForm(rows[0].copyright_notice_submission_id, transaction)
}
