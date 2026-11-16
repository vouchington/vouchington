import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'

export async function insertTestMinimalCopyrightNotice(query: TransactionQuery): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `/* insertTestMinimalCopyrightNotice */
     INSERT INTO copyright_notices
       (jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version)
     VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, 'test-ciphertext',
             'Test work', 'test-v1')
     RETURNING id`,
  )
  return rows[0]!.id
}

export async function insertTestNoContentSourceNotificationTombstone(
  query: TransactionQuery,
  input: {
    userId: string
    deletedAt: Date
    entityType: 'review_dispute' | 'copyright_notice'
    copyrightNoticeId?: string
    eventKey?: string
  },
): Promise<string> {
  // Every copyright kind projects a legal delivery obligation, so the row must cite one.
  const workItem =
    input.entityType === 'copyright_notice'
      ? await query<{ id: string }>(
          `/* insertTestTombstoneCopyrightWorkItem */
           INSERT INTO copyright_notice_delivery_work_items
             (copyright_notice_id, recipient_user_id, recipient_role, delivery_kind, channel, idempotency_key)
           VALUES ($1, $2, 'claimant', 'status_update', 'in_app', $3)
           RETURNING id`,
          [input.copyrightNoticeId, input.userId, `tombstone-${randomUUID()}`],
        )
      : null
  const { rows } = await query<{ id: string }>(
    `/* insertTestNoContentSourceNotificationTombstone */
     INSERT INTO notifications
       (user_id, entity_type, kind, copyright_notice_id, event_key,
        target_intent, deleted_at, delete_reason, copyright_notice_delivery_work_item_id)
     VALUES ($1, $2::notification_entity_types, $6::notification_kinds, $3, $4,
             'notifications_inbox', $5, 'user_deleted', $7)
     RETURNING id`,
    [
      input.userId,
      input.entityType,
      input.copyrightNoticeId ?? null,
      input.eventKey ?? null,
      input.deletedAt,
      input.entityType === 'review_dispute' ? 'review_dispute_resolved' : 'copyright_status_update',
      workItem?.rows[0]?.id ?? null,
    ],
  )
  return rows[0]!.id
}
