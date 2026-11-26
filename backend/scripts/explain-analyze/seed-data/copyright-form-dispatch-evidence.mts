import type { TransactionQuery } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'

export async function seedCopyrightFormDispatchEvidence(
  query: TransactionQuery,
  timestamp: number,
  noticeIds: string[],
  submissionIds: string[],
) {
  const image = seedUuidAtTimestamp(timestamp, 0)
  const placement = seedUuidAtTimestamp(timestamp, 1)
  await query(
    `/* seedCopyrightFormDispatchEvidence:binding */
     WITH image AS (
       INSERT INTO retained_image_identities (id, created_by_id) VALUES ($1::uuid, $2::uuid)
       RETURNING id
     )
     INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
     SELECT $3::uuid, id, 'post' FROM image`,
    [image, seedUser.id, placement],
  )
  await query(
    `/* seedCopyrightFormDispatchEvidence:targets */
     WITH targets AS (
       INSERT INTO copyright_notice_targets
         (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
       SELECT notice_id, $2::uuid, 1, 'https://example.test/copyright-dispatch'
       FROM unnest($1::uuid[]) AS input(notice_id)
       RETURNING id
     )
     INSERT INTO copyright_notice_target_images
       (copyright_notice_target_id, placement_id, image_id, binding_family)
     SELECT id, $2::uuid, $3::uuid, 'post' FROM targets`,
    [noticeIds, placement, image],
  )
  await query(
    `/* seedCopyrightFormDispatchEvidence:receipts */
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
         'claimant_receipt', 'email', 'explain-form/' || copyright_notice_id,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM messages
       RETURNING id
     )
     INSERT INTO copyright_notice_delivery_recipients
       (copyright_notice_delivery_work_item_id, email_ciphertext)
     SELECT id, 'v1:synthetic-recipient' FROM receipts`,
    [noticeIds, submissionIds],
  )
}
