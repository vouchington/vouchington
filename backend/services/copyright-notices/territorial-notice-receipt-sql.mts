import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export function existingReceiptQuery(
  jurisdiction: TerritorialCopyrightJurisdiction,
  requesterIdentitySha256: Buffer,
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
    WHERE receipt.requester_identity_sha256 = ${requesterIdentitySha256}
      AND receipt.jurisdiction = ${jurisdiction}
      AND receipt.idempotency_key = ${idempotencyKey}`
}

export function insertReceiptQuery(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  approvalId: string,
  requesterUserId: string | null,
  requesterIdentitySha256: Buffer,
  idempotencyKey: string,
  requestSha256: Buffer,
  hostedUseUrl: string,
  groundsCiphertext: string,
  notifierEmailCiphertext: string | null,
  goodFaithStatement: true | null,
) {
  return sql`/* receiveTerritorialCopyrightNotice:receipt */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, requester_identity_sha256, idempotency_key, request_sha256,
      hosted_use_url, grounds_ciphertext, notifier_email_ciphertext, good_faith_statement
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${approvalId}, ${requesterUserId}, ${requesterIdentitySha256},
      ${idempotencyKey}, ${requestSha256}, ${hostedUseUrl}, ${groundsCiphertext},
      ${notifierEmailCiphertext}, ${goodFaithStatement}
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
