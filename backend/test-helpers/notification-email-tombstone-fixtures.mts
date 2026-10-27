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
  const { rows } = await query<{ id: string }>(
    `/* insertTestNoContentSourceNotificationTombstone */
     INSERT INTO notifications
       (user_id, entity_type, copyright_notice_id, event_key, title, body,
        target_intent, deleted_at, delete_reason)
     VALUES ($1, $2::notification_entity_types, $3, $4, 'Retention fixture',
             'Dismissed notification', 'notifications_inbox', $5, 'user_deleted')
     RETURNING id`,
    [
      input.userId,
      input.entityType,
      input.copyrightNoticeId ?? null,
      input.eventKey ?? null,
      input.deletedAt,
    ],
  )
  return rows[0]!.id
}
