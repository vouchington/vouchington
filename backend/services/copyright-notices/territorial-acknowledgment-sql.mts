import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export function lockTerritorialAcknowledgmentQuery(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
) {
  return sql`/* recordTerritorialAcknowledgment:lock */
    SELECT acknowledgment.id, acknowledgment.attempt_count, acknowledgment.last_attempt_at,
      acknowledgment.acknowledged_at, acknowledgment.exhausted_at, receipt.requester_user_id,
      false AS escalated
    FROM copyright_territorial_notice_acknowledgments acknowledgment
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.id = acknowledgment.copyright_territorial_notice_receipt_id
    WHERE receipt.copyright_notice_id = ${noticeId} AND receipt.jurisdiction = ${jurisdiction}
    FOR UPDATE OF acknowledgment`
}

export function updateTerritorialAcknowledgmentQuery(
  acknowledgmentId: string,
  outcome: 'acknowledged' | 'failed',
) {
  return sql`/* recordTerritorialAcknowledgment */
    UPDATE copyright_territorial_notice_acknowledgments
    SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP,
      acknowledged_at = CASE WHEN ${outcome} = 'acknowledged'
        THEN CURRENT_TIMESTAMP ELSE acknowledged_at END,
      exhausted_at = CASE
        WHEN ${outcome} = 'failed' AND attempt_count + 1 = 5 THEN CURRENT_TIMESTAMP
        ELSE exhausted_at
      END
    WHERE id = ${acknowledgmentId}
    RETURNING id, attempt_count, last_attempt_at, acknowledged_at, exhausted_at,
      false AS escalated`
}

export function insertTerritorialAcknowledgmentEscalationQuery(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  acknowledgmentId: string,
) {
  return sql`/* recordTerritorialAcknowledgment:escalate */
    INSERT INTO copyright_territorial_escalations (
      copyright_notice_id, jurisdiction, copyright_territorial_notice_acknowledgment_id
    ) VALUES (${noticeId}, ${jurisdiction}, ${acknowledgmentId})`
}
