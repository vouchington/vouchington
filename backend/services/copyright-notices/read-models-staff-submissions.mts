import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { decryptSecret } from '@modules/token-secrets'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { groupByNotice } from './read-models-staff-group.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { parseStoredCopyrightSubmissionGuidance } from './read-models-staff-guidance.mts'

export { selectStaffRestrictions } from './read-models-staff-restrictions.mts'

export async function selectStaffAppeals(noticeIds: readonly string[], query: TransactionQuery) {
  const { rows } = await query<{
    copyright_notice_id: string
    submission_id: string
    body_ciphertext: string
    target_ids: string[]
    recommendation_id: string | null
    recommendation: FiniteValue<'copyright_notice_appeal_recommendation_outcomes'> | null
    rationale_ciphertext: string | null
  }>(sql`/* getPendingCopyrightStaffCase:appeals */
    SELECT submission.copyright_notice_id, submission.id AS submission_id, submission.body_ciphertext,
      ARRAY(SELECT target.copyright_notice_target_id FROM copyright_notice_submission_targets target WHERE target.copyright_notice_submission_id = submission.id ORDER BY target.copyright_notice_target_id) AS target_ids,
      recommendation.id AS recommendation_id, recommendation.recommendation, recommendation.rationale_ciphertext
    FROM copyright_notice_submissions submission
    LEFT JOIN LATERAL (SELECT id, recommendation, rationale_ciphertext FROM copyright_notice_appeal_recommendations WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1) recommendation ON true
    LEFT JOIN copyright_notice_appeal_reviews review ON review.copyright_notice_submission_id = submission.id
    WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND submission.kind = 'appeal' AND review.id IS NULL
    ORDER BY submission.received_at, submission.id
  `)
  return groupByNotice(
    rows.map(row => {
      const appeal = parseAppeal(
        decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
      )
      return {
        copyright_notice_id: row.copyright_notice_id,
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
    }),
  )
}

export async function selectStaffCounterNotices(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  const { rows } = await query<{
    copyright_notice_id: string
    submission_id: string
    received_at: Date
    body_ciphertext: string
    target_ids: string[]
    guidance_ciphertext: string | null
  }>(sql`/* getPendingCopyrightStaffCase:counters */
    SELECT submission.copyright_notice_id, submission.id AS submission_id, submission.received_at, submission.body_ciphertext,
      guidance.guidance_ciphertext,
      ARRAY(SELECT target.copyright_notice_target_id FROM copyright_notice_submission_targets target WHERE target.copyright_notice_submission_id = submission.id ORDER BY target.copyright_notice_target_id) AS target_ids
    FROM copyright_notice_submissions submission
    LEFT JOIN LATERAL (
      SELECT guidance_ciphertext FROM copyright_notice_submission_guidance
      WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1
    ) guidance ON true
    LEFT JOIN copyright_notice_counter_notice_reviews review ON review.copyright_notice_submission_id = submission.id
    WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND submission.kind = 'counter_notice' AND review.id IS NULL
    ORDER BY submission.received_at, submission.id
  `)
  return groupByNotice(
    rows.map(row => ({
      copyright_notice_id: row.copyright_notice_id,
      submission_id: row.submission_id,
      received_at: row.received_at,
      target_ids: row.target_ids,
      guidance: parseStoredCopyrightSubmissionGuidance(
        row.guidance_ciphertext,
        row.submission_id,
        'counter_notice',
      ),
      statement: parseStatement(
        decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
      ),
    })),
  )
}

function parseAppeal(value: string): { reason: string } {
  const parsed = JSON.parse(value) as { reason?: unknown }
  if (typeof parsed.reason !== 'string') throw new TypeError('Stored copyright appeal is invalid')
  return { reason: parsed.reason }
}

export function parseStatement(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('Stored copyright counter-notice is invalid')
  return parsed as Record<string, unknown>
}
