import { createHash, randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

export async function seedCopyrightReceiptReview(input: {
  reviewerId: string
  reviewedAt: Date
  erased?: boolean
}): Promise<{ id: string; sesMessageId: string; rawStorageKey: string; rawSha256: Buffer }> {
  const id = v7({ msecs: input.reviewedAt.getTime() - 86_400_000 })
  const sesMessageId = `receipt-review-${randomUUID()}`
  const rawStorageKey = `email/${sesMessageId}/original.eml`
  const rawSha256 = Buffer.alloc(32, 1)
  await write(sql`/* seedCopyrightReceiptReview */
    INSERT INTO copyright_notice_email_intake_receipts
      (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size,
       erased_at, review_decision, reviewed_at, reviewed_by_id, review_rationale_ciphertext)
    VALUES (${id}, ${sesMessageId}, ${rawSha256}, ${createHash('sha256').update(rawStorageKey).digest()}, 12,
      ${input.erased === false ? null : input.reviewedAt}, 'rejected', ${input.reviewedAt},
      ${input.reviewerId}, 'v1:test-rationale')`)
  return { id, sesMessageId, rawStorageKey, rawSha256 }
}

export async function readCopyrightReceiptReview(id: string) {
  const { rows } = await read<{
    amazon_ses_message_id: string
    review_decision: string | null
    reviewed_by_id: string | null
    reviewed_at: Date | null
    review_rationale_ciphertext: string | null
    current_preservation_hold_token: string | null
    last_preservation_hold_released_at: Date | null
  }>(sql`/* readCopyrightReceiptReview */
    SELECT amazon_ses_message_id, review_decision, reviewed_by_id, reviewed_at,
      review_rationale_ciphertext, current_preservation_hold_token,
      last_preservation_hold_released_at
    FROM copyright_notice_email_intake_receipts WHERE id = ${id}`)
  return rows[0] ?? null
}

export async function insertPendingCopyrightReceiptDelivery(receiptId: string) {
  await write(sql`/* insertPendingCopyrightReceiptDelivery */
    INSERT INTO copyright_notice_delivery_work_items
      (copyright_notice_email_intake_receipt_id, recipient_role, delivery_kind, channel,
       idempotency_key, body_ciphertext)
    VALUES (${receiptId}, 'correspondent', 'email_intake_rejected', 'email',
      ${`receipt-review-delivery-${randomUUID()}`}, 'v1:reply')`)
}

export async function attemptCopyrightReceiptReviewMutation(id: string) {
  return write(sql`/* attemptCopyrightReceiptReviewMutation */
    UPDATE copyright_notice_email_intake_receipts
    SET review_decision = NULL, reviewed_at = NULL, reviewed_by_id = NULL,
      review_rationale_ciphertext = NULL
    WHERE id = ${id}`)
}
