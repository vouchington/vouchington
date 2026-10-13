import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { decryptCopyrightJson } from './erased-ciphertext.mts'
import { groupByNotice } from './read-models-staff-group.mts'
import { parseStoredCopyrightSubmissionGuidance } from './read-models-staff-guidance.mts'
import { parseStatement } from './read-models-staff-submissions.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'

export async function selectStaffLegalHolds(
  noticeIds: readonly string[],
  query: TransactionQuery,
): Promise<Map<string, CopyrightStaffCase['legal_holds']>> {
  const { rows } = await query<{
    copyright_notice_id: string
    submission_id: string
    received_at: Date
    body_ciphertext: string
    assessment_id: string | null
    assessed_at: Date | null
    is_from_original_claimant: boolean | null
    proceeding_kind: 'federal_court' | 'ccb' | null
    ccb_claim_kind: 'claim' | 'counterclaim' | null
    commenced_at: Date | null
    received_by_designated_agent_at: Date | null
    is_same_material: boolean | null
    target_ids: string[]
    resolution_id: string | null
    guidance_ciphertext: string | null
  }>(sql`/* getPendingCopyrightStaffCase:legalHolds */
    SELECT submission.copyright_notice_id, submission.id AS submission_id,
      submission.received_at, submission.body_ciphertext,
      guidance.guidance_ciphertext,
      assessment.id AS assessment_id, assessment.assessed_at, assessment.is_from_original_claimant,
      assessment.proceeding_kind, assessment.ccb_claim_kind, assessment.commenced_at,
      assessment.received_by_designated_agent_at, assessment.is_same_material,
      COALESCE(ARRAY(
        SELECT target.copyright_notice_target_id
        FROM copyright_notice_legal_hold_assessment_targets target
        WHERE target.copyright_notice_legal_hold_assessment_id = assessment.id
        ORDER BY target.copyright_notice_target_id
      ), '{}') AS target_ids,
      resolution.id AS resolution_id
    FROM copyright_notice_submissions submission
    LEFT JOIN LATERAL (
      SELECT guidance_ciphertext FROM copyright_notice_submission_guidance
      WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1
    ) guidance ON true
    LEFT JOIN copyright_notice_legal_hold_assessments assessment
      ON assessment.copyright_notice_submission_id = submission.id
    LEFT JOIN copyright_notice_legal_hold_resolutions resolution
      ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
    WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[])
      AND submission.kind = 'court_or_ccb_hold'
    ORDER BY submission.received_at, submission.id, assessment.id
  `)
  return groupByNotice(
    rows.map(row => ({
      copyright_notice_id: row.copyright_notice_id,
      submission_id: row.submission_id,
      received_at: row.received_at,
      statement: parseStatement(
        decryptCopyrightJson(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
      ),
      guidance: parseStoredCopyrightSubmissionGuidance(
        row.guidance_ciphertext,
        row.submission_id,
        'court_or_ccb_hold',
      ),
      assessment: row.assessment_id
        ? {
            id: row.assessment_id,
            is_from_original_claimant: row.is_from_original_claimant === true,
            proceeding_kind: row.proceeding_kind,
            ccb_claim_kind: row.ccb_claim_kind,
            commenced_at: row.commenced_at,
            received_by_designated_agent_at: row.received_by_designated_agent_at,
            is_same_material: row.is_same_material === true,
            target_ids: row.target_ids,
            qualifying:
              row.is_from_original_claimant === true &&
              row.proceeding_kind !== null &&
              row.commenced_at !== null &&
              row.received_by_designated_agent_at !== null &&
              row.assessed_at !== null &&
              row.received_by_designated_agent_at <= row.assessed_at &&
              row.is_same_material === true,
            resolved: row.resolution_id !== null,
          }
        : null,
    })),
  )
}
