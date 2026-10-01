import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export function existingReceiptQuery(
  jurisdiction: TerritorialCopyrightJurisdiction,
  actorId: string,
  idempotencyKey: string,
) {
  return sql`/* receiveTerritorialCopyrightNotice:existing */
    SELECT receipt.copyright_notice_id AS notice_id, receipt.id AS receipt_id,
      receipt.request_sha256, acknowledgment.id AS acknowledgment_id,
      routing.destination AS route_destination
    FROM copyright_territorial_notice_receipts receipt
    JOIN copyright_territorial_notice_acknowledgments acknowledgment
      ON acknowledgment.copyright_territorial_notice_receipt_id = receipt.id
    JOIN copyright_territorial_notice_routings routing
      ON routing.copyright_territorial_notice_receipt_id = receipt.id
    WHERE receipt.requester_user_id = ${actorId}
      AND receipt.jurisdiction = ${jurisdiction}
      AND receipt.idempotency_key = ${idempotencyKey}`
}

export function insertReceiptQuery(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  approvalId: string,
  actorId: string,
  idempotencyKey: string,
  requestSha256: Buffer,
  hostedUseUrl: string,
  groundsCiphertext: string,
) {
  return sql`/* receiveTerritorialCopyrightNotice:receipt */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_territorial_policy_approval_id,
      requester_user_id, idempotency_key, request_sha256, hosted_use_url, grounds_ciphertext
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${approvalId}, ${actorId}, ${idempotencyKey}, ${requestSha256},
      ${hostedUseUrl}, ${groundsCiphertext}
    ) RETURNING id`
}

export function insertRoutingQuery(receiptId: string) {
  return sql`/* receiveTerritorialCopyrightNotice:routing */
    INSERT INTO copyright_territorial_notice_routings (
      copyright_territorial_notice_receipt_id, destination
    ) VALUES (${receiptId}, 'staff_queue')`
}

export function insertAcknowledgmentQuery(receiptId: string) {
  return sql`/* receiveTerritorialCopyrightNotice:acknowledgment */
    INSERT INTO copyright_territorial_notice_acknowledgments (
      copyright_territorial_notice_receipt_id
    ) VALUES (${receiptId}) RETURNING id`
}
