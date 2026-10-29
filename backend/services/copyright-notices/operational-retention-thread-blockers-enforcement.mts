import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  advanceCopyrightThreadBlockerPhase,
  skipCopyrightThreadEnforcementAssessment,
  type BlockerCursor,
} from './operational-retention-thread-blockers-state.mts'
import { readCopyrightThreadEnforcementScreeningPage } from './operational-retention-thread-blockers-enforcement-screening.mts'

type Row = { id: string; blocked: boolean }

export async function readCopyrightThreadEnforcementPage(
  transaction: TransactionQuery,
  noticeId: string,
  batchSize: number,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  if (cursor.phase === 'enforcement_assessments') {
    const statement = sql`
      /* scanCopyrightThreadEnforcementAssessment */
      WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
      page AS MATERIALIZED (
        SELECT id, copyright_notice_submission_id, copyright_notice_form_screening_id,
          is_substantially_compliant FROM copyright_notice_submission_assessments
        WHERE copyright_notice_id = (SELECT notice_id FROM owner)
          AND id > COALESCE(${cursor.childId}::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY id LIMIT 1
      )
      SELECT assessment.id,
        assessment.copyright_notice_form_screening_id IS NOT NULL AS requires_screening,
        (submission.kind = 'notice' AND assessment.is_substantially_compliant
        AND (assessment.copyright_notice_form_screening_id IS NULL OR (
          execution.state = 'completed'
          AND execution.copyright_notice_form_screening_id = assessment.copyright_notice_form_screening_id
          AND screening.recommendation = 'not_obviously_invalid'
          AND submission.source_kind = 'signed_in_form'
          AND intake.requester_user_id IS NOT NULL
          AND notice.jurisdiction = 'us_dmca'
          AND char_length(notice.claimant_contact_ciphertext) > 0
          AND char_length(btrim(notice.work_description)) > 0
          AND intake.has_good_faith_belief
          AND intake.has_accuracy_authority_under_penalty_of_perjury
          AND char_length(intake.electronic_signature_ciphertext) > 0
        ))
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id LIMIT 1)
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_intakes intake
          JOIN copyright_notice_form_intake_reviews review
            ON review.copyright_notice_form_intake_id = intake.id
              AND NOT review.is_accepted
          WHERE intake.copyright_notice_submission_id = submission.id LIMIT 1)
      ) AS pending FROM page assessment
      JOIN copyright_notice_submissions submission
        ON submission.id = assessment.copyright_notice_submission_id
      JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
      LEFT JOIN copyright_notice_form_intakes intake
        ON intake.copyright_notice_submission_id = submission.id
      LEFT JOIN LATERAL (
        SELECT attempt.state, attempt.copyright_notice_form_screening_id
        FROM copyright_notice_form_screening_attempts attempt
        WHERE attempt.copyright_notice_form_intake_id = intake.id
        ORDER BY attempt.attempt_number DESC LIMIT 1
      ) execution ON true
      LEFT JOIN copyright_notice_form_screenings screening
        ON screening.id = execution.copyright_notice_form_screening_id`
    const { rows } = await transaction<{
      id: string
      pending: boolean
      requires_screening: boolean
    }>(statement)
    const assessment = rows[0]
    if (!assessment) return advanceCopyrightThreadBlockerPhase(cursor, 'deadlines')
    if (!assessment.pending) return { ...cursor, childId: assessment.id, blocked: false }
    return {
      ...cursor,
      phase: 'enforcement_reversal_decisions',
      assessmentId: assessment.id,
      childId: null,
      blocked: false,
    }
  }
  if (cursor.phase === 'enforcement_reversal_decisions') {
    const { rows } = await transaction<{ id: string; outcome: string }>(sql`
      /* scanCopyrightThreadEnforcementReversalDecisions */
      WITH owner AS MATERIALIZED (SELECT ${cursor.assessmentId}::uuid AS assessment_id)
      SELECT id, outcome FROM copyright_territorial_decisions
      WHERE copyright_notice_submission_assessment_id = (SELECT assessment_id FROM owner)
        AND id > COALESCE(${cursor.childId}::uuid,
          '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT 1`)
    const decision = rows[0]
    if (!decision) {
      const { rows: assessments } = await transaction<{
        copyright_notice_form_screening_id: string | null
      }>(sql`/* readCopyrightThreadEnforcementAssessmentScreening */
        SELECT copyright_notice_form_screening_id
        FROM copyright_notice_submission_assessments
        WHERE id = ${cursor.assessmentId} LIMIT 1`)
      return {
        ...cursor,
        phase: assessments[0]?.copyright_notice_form_screening_id
          ? 'enforcement_screening_targets'
          : 'enforcement_targets',
        childId: null,
        territorialDecisionId: null,
        blocked: false,
      }
    }
    if (decision.outcome !== 'restrict') {
      return { ...cursor, childId: decision.id, blocked: false }
    }
    return {
      ...cursor,
      phase: 'enforcement_reversal_requests',
      childId: null,
      territorialDecisionId: decision.id,
      blocked: false,
    }
  }
  if (cursor.phase === 'enforcement_reversal_requests') {
    const { rows } = await transaction<{ id: string; revoked: boolean }>(sql`
      /* scanCopyrightThreadEnforcementReversalRequests */
      WITH owner AS MATERIALIZED (SELECT ${cursor.territorialDecisionId}::uuid AS decision_id),
      page AS MATERIALIZED (
        SELECT id FROM copyright_territorial_redress_requests
        WHERE copyright_territorial_decision_id = (SELECT decision_id FROM owner)
          AND id > COALESCE(${cursor.childId}::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY id LIMIT ${batchSize}
      )
      SELECT page.id, redress.staff_disposition = 'revoke' AS revoked FROM page
      LEFT JOIN copyright_territorial_redress_decisions redress
        ON redress.copyright_territorial_redress_request_id = page.id`)
    if (rows.some(row => row.revoked)) return skipCopyrightThreadEnforcementAssessment(cursor)
    if (rows.length < batchSize) {
      return {
        ...cursor,
        phase: 'enforcement_reversal_decisions',
        childId: cursor.territorialDecisionId,
        territorialDecisionId: null,
        blocked: false,
      }
    }
    return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
  }
  if (
    cursor.phase === 'enforcement_screening_targets' ||
    cursor.phase === 'enforcement_screening_receipts'
  ) {
    return readCopyrightThreadEnforcementScreeningPage(transaction, noticeId, batchSize, cursor)
  }
  const { rows } = await transaction<Row>(sql`/* scanCopyrightThreadEnforcementTargets */
    WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
    page AS MATERIALIZED (
      SELECT id FROM copyright_notice_targets
      WHERE copyright_notice_id = (SELECT notice_id FROM owner)
        AND id > COALESCE(${cursor.childId}::uuid,
          '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT ${batchSize}
    )
    SELECT page.id, NOT EXISTS (
      SELECT 1 FROM copyright_restrictions restriction
      WHERE restriction.copyright_notice_target_id = page.id LIMIT 1
    ) AS blocked FROM page`)
  if (rows.some(row => row.blocked)) return { ...cursor, blocked: true }
  if (rows.length < batchSize) {
    return skipCopyrightThreadEnforcementAssessment(cursor)
  }
  return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
}
