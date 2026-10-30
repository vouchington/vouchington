import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

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
      requester_user_id, requester_identity_hmac, idempotency_key, request_sha256,
      hosted_use_url, grounds_ciphertext, notifier_email_ciphertext, has_good_faith_statement
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
