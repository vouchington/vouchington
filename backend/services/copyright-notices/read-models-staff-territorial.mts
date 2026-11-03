import { decryptSecret } from '@modules/token-secrets'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightStaffTerritorialCase } from './read-models-staff-territorial-types.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'

/**
 * Reads the live territorial decision and the receipt that gives staff each case. Cases without a
 * receipt in their own jurisdiction are absent from the map.
 */
export async function selectStaffTerritorialCases(
  noticeIds: readonly string[],
  query: TransactionQuery,
): Promise<Map<string, CopyrightStaffTerritorialCase>> {
  if (noticeIds.length === 0) return new Map()
  const { rows } = await query<{
    notice_id: string
    jurisdiction: TerritorialCopyrightJurisdiction
    idempotency_key: string
    hosted_use_url: string
    grounds_ciphertext: string
    notifier_email_ciphertext: string | null
    notifier_name: string | null
    attempt_count: number | null
    last_attempt_at: Date | null
    acknowledged_at: Date | null
    exhausted_at: Date | null
    escalated: boolean
    decision_id: string | null
    outcome: 'restrict' | 'no_action' | null
    decided_at: Date | null
    rationale_ciphertext: string | null
    public_explanation_ciphertext: string | null
    reopened_at: Date | null
    complaint_count: number
    dispute_settlement_count: number
  }>(
    sql`/* selectStaffTerritorialCase */
      SELECT receipt.copyright_notice_id AS notice_id, receipt.jurisdiction,
        receipt.idempotency_key, receipt.hosted_use_url, receipt.grounds_ciphertext,
        receipt.notifier_email_ciphertext, notice.claimant_display_name AS notifier_name,
        acknowledgment.attempt_count, acknowledgment.last_attempt_at,
        acknowledgment.acknowledged_at, acknowledgment.exhausted_at,
        EXISTS (SELECT 1 FROM copyright_territorial_escalations escalation
          WHERE escalation.copyright_territorial_notice_acknowledgment_id = acknowledgment.id
        ) AS escalated,
        notice.current_territorial_decision_identity_id AS decision_id,
        notice.territorial_decision_outcome AS outcome,
        notice.territorial_decided_at AS decided_at,
        notice.territorial_rationale_ciphertext AS rationale_ciphertext,
        notice.territorial_public_explanation_ciphertext AS public_explanation_ciphertext,
        CASE WHEN notice.territorial_decision_outcome = 'no_action'
          THEN reopened.decided_at ELSE NULL END AS reopened_at,
        reopened.complaint_count,
        (SELECT count(*)::int FROM copyright_eu_dispute_settlement_referrals referral
          WHERE referral.copyright_notice_id = receipt.copyright_notice_id
        ) AS dispute_settlement_count
      -- no-mistakes-disable-next-line postgres-bounded-statements: copyright_territorial_notice_receipts is read for the notice ids of one review-queue page (ANY of the caller's bounded id array); copyright_notices and copyright_territorial_notice_acknowledgments join to those receipts by notice id and receipt id, so each adds at most one row per receipt, and the count subselects aggregate to one row each.
      FROM copyright_territorial_notice_receipts receipt
      -- no-mistakes-disable-next-line postgres-bounded-statements: copyright_notices is joined by primary key to each page receipt, so it adds at most one row per receipt.
      JOIN copyright_notices notice ON notice.id = receipt.copyright_notice_id
      -- no-mistakes-disable-next-line postgres-bounded-statements: Acknowledgments are joined by receipt id, so they add at most the receipt's own acknowledgment rows.
      LEFT JOIN copyright_territorial_notice_acknowledgments acknowledgment
        ON acknowledgment.copyright_territorial_notice_receipt_id = receipt.id
      LEFT JOIN LATERAL (
        SELECT min(request.decided_at) FILTER (WHERE request.staff_disposition = 'revoke') AS decided_at,
          count(*)::int AS complaint_count
        FROM copyright_territorial_redress_requests request
        WHERE request.copyright_territorial_decision_id = notice.current_territorial_decision_identity_id
      ) reopened ON true
      WHERE receipt.copyright_notice_id = ANY(${noticeIds}::uuid[])
        AND receipt.jurisdiction = notice.jurisdiction
      ORDER BY receipt.copyright_notice_id`,
  )
  const receipts = new Map<string, (typeof rows)[number]>()
  for (const row of rows) if (!receipts.has(row.notice_id)) receipts.set(row.notice_id, row)
  return new Map(
    [...receipts.values()].map((row): [string, CopyrightStaffTerritorialCase] => {
      const noticeId = row.notice_id
      const labels = territorialLabels(row.jurisdiction)
      return [
        noticeId,
        {
          hosted_use_url: row.hosted_use_url,
          grounds: decryptSecret(
            row.grounds_ciphertext,
            `${labels.noticePurpose}:${row.idempotency_key}:grounds`,
          ),
          notifier: {
            name: row.notifier_name,
            email: row.notifier_email_ciphertext
              ? decryptSecret(
                  row.notifier_email_ciphertext,
                  `${labels.noticePurpose}:${row.idempotency_key}:notifier_email`,
                )
              : null,
          },
          complaint_count: row.complaint_count,
          dispute_settlement_count: row.dispute_settlement_count,
          acknowledgment: {
            attempt_count: row.attempt_count ?? 0,
            last_attempt_at: row.last_attempt_at,
            acknowledged_at: row.acknowledged_at,
            exhausted_at: row.exhausted_at,
            escalated: row.escalated,
          },
          reopened_at: row.reopened_at,
          decision:
            row.decision_id &&
            row.outcome &&
            row.decided_at &&
            row.rationale_ciphertext &&
            row.public_explanation_ciphertext
              ? {
                  id: row.decision_id,
                  outcome: row.outcome,
                  decided_at: row.decided_at,
                  rationale: decryptSecret(
                    row.rationale_ciphertext,
                    `${labels.decisionPurpose}:${noticeId}`,
                  ),
                  public_explanation: decryptSecret(
                    row.public_explanation_ciphertext,
                    `${labels.publicExplanationPurpose}:${noticeId}`,
                  ),
                }
              : null,
        },
      ]
    }),
  )
}
