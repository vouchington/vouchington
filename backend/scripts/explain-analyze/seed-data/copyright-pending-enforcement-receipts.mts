import assert from 'node:assert/strict'
import type { TransactionQuery } from '@data-stores/psql'

export async function seedCopyrightPendingEnforcementReceipts(
  query: TransactionQuery,
  notices: string[],
  submissions: string[],
) {
  const receipts = await query(
    `/* seedCopyrightPendingEnforcementReceipts */
     WITH messages AS (
       INSERT INTO copyright_notice_correspondence_messages
         (copyright_notice_id, copyright_notice_submission_id, direction, composition_kind,
          correspondence_kind, body_ciphertext, sent_at)
       SELECT notice_id, submission_id, 'outbound', 'deterministic_template',
         'receipt', 'v1:synthetic-receipt-body', CURRENT_TIMESTAMP
       FROM unnest($1::uuid[], $2::uuid[]) AS input(notice_id, submission_id)
       RETURNING id, copyright_notice_id, copyright_notice_submission_id
     ), receipts AS (
       INSERT INTO copyright_notice_delivery_work_items
         (copyright_notice_id, copyright_notice_submission_id, copyright_notice_correspondence_message_id,
          recipient_role, delivery_kind, channel, idempotency_key, delivery_attempted_at, sent_at)
       SELECT copyright_notice_id, copyright_notice_submission_id, id, 'claimant',
         'claimant_receipt', 'email', 'explain-enforcement/' || copyright_notice_id,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM messages RETURNING id
     )
     INSERT INTO copyright_notice_delivery_recipients
       (copyright_notice_delivery_work_item_id, email_ciphertext)
     SELECT id, 'v1:synthetic-recipient' FROM receipts`,
    [notices, submissions],
  )
  assert.equal(receipts.rowCount, notices.length)
}
