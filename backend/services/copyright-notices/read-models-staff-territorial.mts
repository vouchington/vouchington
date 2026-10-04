import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import type { CopyrightStaffTerritorialCase } from './read-models-staff-types.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'
import { territorialDecisionIsLiveSql } from './territorial-redress-sql.mts'

/** Reads the live territorial decision and the receipt that gives staff this case. */
export async function selectStaffTerritorialCase(
  noticeId: string,
  jurisdiction: TerritorialCopyrightJurisdiction,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightStaffTerritorialCase | null> {
  const { rows } = await query<{
    idempotency_key: string
    hosted_use_url: string
    grounds_ciphertext: string
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
  }>(
    sql`/* selectStaffTerritorialCase */
      SELECT receipt.idempotency_key, receipt.hosted_use_url, receipt.grounds_ciphertext,
        acknowledgment.attempt_count, acknowledgment.last_attempt_at,
        acknowledgment.acknowledged_at, acknowledgment.exhausted_at,
        EXISTS (SELECT 1 FROM copyright_territorial_escalations escalation
          WHERE escalation.copyright_territorial_notice_acknowledgment_id = acknowledgment.id
        ) AS escalated,
        decision.id AS decision_id, decision.outcome, decision.decided_at,
        decision.rationale_ciphertext, decision.public_explanation_ciphertext,
        CASE WHEN decision.outcome = 'no_action' THEN reopened.decided_at ELSE NULL END AS reopened_at
      FROM copyright_territorial_notice_receipts receipt
      LEFT JOIN copyright_territorial_notice_acknowledgments acknowledgment
        ON acknowledgment.copyright_territorial_notice_receipt_id = receipt.id
      LEFT JOIN LATERAL (
        SELECT decision.id, decision.outcome, decision.decided_at,
          decision.rationale_ciphertext, decision.public_explanation_ciphertext
        FROM copyright_territorial_decisions decision
        WHERE decision.copyright_notice_id = receipt.copyright_notice_id
          AND decision.jurisdiction = receipt.jurisdiction AND `.append(
      territorialDecisionIsLiveSql(),
    ).append(sql` LIMIT 1
      ) decision ON true
      LEFT JOIN LATERAL (
        SELECT min(redress.decided_at) AS decided_at
        FROM copyright_territorial_redress_requests request
        JOIN copyright_territorial_redress_decisions redress
          ON redress.copyright_territorial_redress_request_id = request.id
        WHERE request.copyright_territorial_decision_id = decision.id
          AND redress.staff_disposition = 'revoke'
      ) reopened ON true
      WHERE receipt.copyright_notice_id = ${noticeId} AND receipt.jurisdiction = ${jurisdiction}`),
  )
  const row = rows[0]
  if (!row) return null
  const labels = territorialLabels(jurisdiction)
  return {
    hosted_use_url: row.hosted_use_url,
    grounds: decryptCopyrightText(
      row.grounds_ciphertext,
      `${labels.noticePurpose}:${row.idempotency_key}:grounds`,
    ),
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
            rationale: decryptCopyrightText(
              row.rationale_ciphertext,
              `${labels.decisionPurpose}:${noticeId}`,
            ),
            public_explanation: decryptCopyrightText(
              row.public_explanation_ciphertext,
              `${labels.publicExplanationPurpose}:${noticeId}`,
            ),
          }
        : null,
  }
}
