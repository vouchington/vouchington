import { decryptSecret } from '@modules/token-secrets'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'

export async function selectStaffRestrictions(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightStaffCase['restrictions']> {
  const { rows } = await query<{
    id: string
    target_id: string
    imposed_at: Date
    lifted_at: Date | null
    human_reviewed_at: Date | null
    human_review_action: 'confirm' | 'reverse' | null
  }>(sql`/* getPendingCopyrightStaffCase:restrictions */
    SELECT restriction.id, restriction.copyright_notice_target_id AS target_id, restriction.imposed_at,
      restriction.lifted_at, restriction.human_reviewed_at, restriction.human_review_action
    FROM copyright_restrictions restriction JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId} ORDER BY restriction.id
  `)
  return rows.map(row => ({
    id: row.id,
    target_id: row.target_id,
    imposed_at: row.imposed_at,
    status: (row.lifted_at
      ? 'lifted'
      : row.human_reviewed_at
        ? row.human_review_action === 'reverse'
          ? 'reversed'
          : 'confirmed'
        : 'pending_review') as CopyrightStaffCase['restrictions'][number]['status'],
  }))
}

export async function selectStaffAppeals(noticeId: string, query: TransactionQuery) {
  const { rows } = await query<{
    submission_id: string
    body_ciphertext: string
    target_ids: string[]
    recommendation_id: string | null
    recommendation: string | null
    rationale_ciphertext: string | null
  }>(sql`/* getPendingCopyrightStaffCase:appeals */
    SELECT submission.id AS submission_id, submission.body_ciphertext,
      ARRAY(SELECT target.copyright_notice_target_id FROM copyright_notice_submission_targets target WHERE target.copyright_notice_submission_id = submission.id ORDER BY target.copyright_notice_target_id) AS target_ids,
      recommendation.id AS recommendation_id, recommendation.recommendation, recommendation.rationale_ciphertext
    FROM copyright_notice_submissions submission
    LEFT JOIN LATERAL (SELECT id, recommendation, rationale_ciphertext FROM copyright_notice_appeal_recommendations WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1) recommendation ON true
    LEFT JOIN copyright_notice_appeal_reviews review ON review.copyright_notice_submission_id = submission.id
    WHERE submission.copyright_notice_id = ${noticeId} AND submission.kind = 'appeal' AND review.id IS NULL
    ORDER BY submission.received_at, submission.id
  `)
  return rows.map(row => {
    const appeal = parseAppeal(
      decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
    )
    return {
      submission_id: row.submission_id,
      reason: appeal.reason,
      target_ids: row.target_ids,
      recommendation:
        row.recommendation_id && row.recommendation && row.rationale_ciphertext
          ? {
              id: row.recommendation_id,
              recommendation: row.recommendation,
              rationale: decryptSecret(
                row.rationale_ciphertext,
                `copyright-appeal:${row.submission_id}`,
              ),
            }
          : null,
    }
  })
}

export async function selectStaffCounterNotices(noticeId: string, query: TransactionQuery) {
  const { rows } = await query<{
    submission_id: string
    received_at: Date
    body_ciphertext: string
    target_ids: string[]
  }>(sql`/* getPendingCopyrightStaffCase:counters */
    SELECT submission.id AS submission_id, submission.received_at, submission.body_ciphertext,
      ARRAY(SELECT target.copyright_notice_target_id FROM copyright_notice_submission_targets target WHERE target.copyright_notice_submission_id = submission.id ORDER BY target.copyright_notice_target_id) AS target_ids
    FROM copyright_notice_submissions submission
    LEFT JOIN copyright_notice_counter_notice_reviews review ON review.copyright_notice_submission_id = submission.id
    WHERE submission.copyright_notice_id = ${noticeId} AND submission.kind = 'counter_notice' AND review.id IS NULL
    ORDER BY submission.received_at, submission.id
  `)
  return rows.map(row => ({
    submission_id: row.submission_id,
    received_at: row.received_at,
    target_ids: row.target_ids,
    statement: parseStatement(
      decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
    ),
  }))
}

export async function selectStaffLegalHolds(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightStaffCase['legal_holds']> {
  const { rows } = await query<{
    submission_id: string
    received_at: Date
    body_ciphertext: string
    assessment_id: string | null
    assessed_at: Date | null
    from_original_claimant: boolean | null
    proceeding_kind: 'federal_court' | 'ccb' | null
    ccb_claim_kind: 'claim' | 'counterclaim' | null
    commenced_at: Date | null
    received_by_designated_agent_at: Date | null
    same_material: boolean | null
    target_ids: string[]
    resolution_id: string | null
  }>(sql`/* getPendingCopyrightStaffCase:legalHolds */
    SELECT submission.id AS submission_id, submission.received_at, submission.body_ciphertext,
      assessment.id AS assessment_id, assessment.assessed_at, assessment.from_original_claimant,
      assessment.proceeding_kind, assessment.ccb_claim_kind, assessment.commenced_at,
      assessment.received_by_designated_agent_at, assessment.same_material,
      COALESCE(ARRAY(
        SELECT target.copyright_notice_target_id
        FROM copyright_notice_legal_hold_assessment_targets target
        WHERE target.copyright_notice_legal_hold_assessment_id = assessment.id
        ORDER BY target.copyright_notice_target_id
      ), '{}') AS target_ids,
      resolution.id AS resolution_id
    FROM copyright_notice_submissions submission
    LEFT JOIN copyright_notice_legal_hold_assessments assessment
      ON assessment.copyright_notice_submission_id = submission.id
    LEFT JOIN copyright_notice_legal_hold_resolutions resolution
      ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
    WHERE submission.copyright_notice_id = ${noticeId}
      AND submission.kind = 'court_or_ccb_hold'
    ORDER BY submission.received_at, submission.id, assessment.id
  `)
  return rows.map(row => ({
    submission_id: row.submission_id,
    received_at: row.received_at,
    statement: parseStatement(
      decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
    ),
    assessment: row.assessment_id
      ? {
          id: row.assessment_id,
          from_original_claimant: row.from_original_claimant === true,
          proceeding_kind: row.proceeding_kind,
          ccb_claim_kind: row.ccb_claim_kind,
          commenced_at: row.commenced_at,
          received_by_designated_agent_at: row.received_by_designated_agent_at,
          same_material: row.same_material === true,
          target_ids: row.target_ids,
          qualifying:
            row.from_original_claimant === true &&
            row.proceeding_kind !== null &&
            row.commenced_at !== null &&
            row.received_by_designated_agent_at !== null &&
            row.assessed_at !== null &&
            row.received_by_designated_agent_at <= row.assessed_at &&
            row.same_material === true,
          resolved: row.resolution_id !== null,
        }
      : null,
  }))
}

function parseAppeal(value: string): { reason: string } {
  const parsed = JSON.parse(value) as { reason?: unknown }
  if (typeof parsed.reason !== 'string') throw new TypeError('Stored copyright appeal is invalid')
  return { reason: parsed.reason }
}

function parseStatement(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('Stored copyright counter-notice is invalid')
  return parsed as Record<string, unknown>
}
