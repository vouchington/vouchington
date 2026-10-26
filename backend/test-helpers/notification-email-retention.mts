import { randomInt, randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'

// A disjoint, randomly chosen historical minute lets the SES trigger enforce its real-age guard
// while the cleanup scans only rows this test inserted into its own narrow keyset window.
export function createTestHistoricalRetentionWindow() {
  const step = 60_000
  const firstEligibleDate = new Date(Date.UTC(2010, 0, 1) + randomInt(7_000_000) * step)
  const secondEligibleDate = new Date(firstEligibleDate.getTime() + step)
  const upperBoundDate = new Date(secondEligibleDate.getTime() + step)
  return {
    lowerBoundDate: new Date(firstEligibleDate.getTime() - step),
    firstEligibleDate,
    secondEligibleDate,
    upperBoundDate,
    afterUpperBoundDate: new Date(upperBoundDate.getTime() + step),
  }
}

export async function resetTestNotificationEmailRetentionCursor(
  query: TransactionQuery,
  name: string,
): Promise<void> {
  await query(
    `/* resetTestNotificationEmailRetentionCursor */
     INSERT INTO notification_email_retention_cleanup_cursors (cleanup_name)
     VALUES ($1) ON CONFLICT (cleanup_name) DO UPDATE
     SET cursor_at = NULL, cursor_notification_id = NULL, cursor_user_id = NULL, sweep_cutoff_at = NULL`,
    [name],
  )
}

export async function testNotificationEmailRetentionRowExists(
  query: TransactionQuery,
  table: 'amazon_ses_bounce_events' | 'user_moderation_email_sends' | 'notifications',
  id: string,
): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `/* testNotificationEmailRetentionRowExists */
     SELECT EXISTS (SELECT 1 FROM ${table} WHERE id = $1) AS exists`,
    [id],
  )
  return result.rows[0]!.exists
}

export async function insertTestSesRetentionEvent(
  query: TransactionQuery,
  kind: 'transient' | 'permanent' | 'complaint',
  at: Date,
): Promise<string> {
  const id = v7({ msecs: at.getTime() })
  const emailAddress = `tests+${id}@voucha.ai`
  await query(
    `/* insertTestSesRetentionEvent */
     INSERT INTO amazon_ses_bounce_events
       (id, notification_type, bounce_type, recipients, occurred_at, raw_message)
     VALUES ($1, $2, $3::amazon_ses_bounce_types, $5::jsonb, $4, '{}')`,
    [
      id,
      kind === 'complaint' ? 'complaint' : 'bounce',
      kind === 'complaint' ? null : kind,
      at,
      JSON.stringify([emailAddress]),
    ],
  )
  if (kind !== 'transient') {
    await query(
      `/* insertTestSesRetentionSuppression */
       INSERT INTO amazon_ses_address_suppressions
         (email_address, first_event_at, first_notification_type, latest_event_at, latest_notification_type)
       VALUES ($1, $2, $3, $2, $3)`,
      [emailAddress, at, kind === 'complaint' ? 'complaint' : 'bounce'],
    )
  }
  return id
}

export async function getTestRejectedSesRetentionDelete(
  query: TransactionQuery,
  id: string,
): Promise<unknown> {
  // The transaction wrapper fails closed after a rejected statement. The borrowed client
  // keeps this SAVEPOINT probe recoverable without poisoning the fixture transaction.
  const client = query.client
  await client.query(
    '/* getTestRejectedSesRetentionDeleteSavepoint */ SAVEPOINT reject_test_ses_retention_delete',
  )
  try {
    await client.query(
      '/* rejectTestSesRetentionDelete */ DELETE FROM amazon_ses_bounce_events WHERE id = $1',
      [id],
    )
    return null
  } catch (err) {
    return err
  } finally {
    await client.query(
      '/* getTestRejectedSesRetentionDeleteRollback */ ROLLBACK TO SAVEPOINT reject_test_ses_retention_delete',
    )
  }
}

export async function insertTestModerationSend(
  query: TransactionQuery,
  userId: string,
  at: Date,
): Promise<string> {
  const id = v7({ msecs: at.getTime() })
  await query(
    `/* insertTestModerationSend */
     INSERT INTO user_moderation_email_sends (id, user_id, send_key, claimed_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, `daily:${at.toISOString().slice(0, 10)}:${randomUUID()}`, at],
  )
  return id
}

export async function markTestRetentionNotificationDeleted(
  query: TransactionQuery,
  userId: string,
  id: string,
  deletedAt: Date | string,
  reason: 'system_pruned' | 'user_deleted',
): Promise<void> {
  await query(
    `/* markTestRetentionNotificationDeleted */
     UPDATE notifications SET deleted_at = $3::timestamptz, delete_reason = $4
     WHERE user_id = $1 AND id = $2`,
    [userId, id, deletedAt, reason],
  )
}

export async function deleteTestRetentionNotificationPushIntents(
  query: TransactionQuery,
  userId: string,
  ids: string[],
): Promise<void> {
  await query(
    `/* deleteTestRetentionNotificationPushIntents */
     DELETE FROM notification_push_intents
     WHERE user_id = $1 AND notification_id = ANY($2::uuid[])`,
    [userId, ids],
  )
}

export async function insertTestRetentionNotificationPushIntent(
  query: TransactionQuery,
  userId: string,
  id: string,
): Promise<void> {
  await query(
    `/* insertTestRetentionNotificationPushIntent */
     INSERT INTO notification_push_intents (user_id, notification_id) VALUES ($1, $2)`,
    [userId, id],
  )
}

export async function insertTestSameIdNotificationTombstones(
  query: TransactionQuery,
  users: string[],
  id: string,
  at: Date,
): Promise<void> {
  const publicationRssFeedItemId = v7()
  await query(
    `/* insertTestSameIdNotificationIdentity */
     INSERT INTO retained_rss_feed_item_identities (id) VALUES ($1)`,
    [publicationRssFeedItemId],
  )
  for (const userId of users) {
    await query(
      `/* insertTestSameIdNotificationTombstone */
       INSERT INTO notifications
         (user_id, id, entity_type, delivery_type, sent_by_id,
          publication_rss_feed_item_id, title, body, target_path, deleted_at, delete_reason)
       VALUES ($1, $2, 'rss_feed_item', 'manual_send', $1, $4,
               'Retention fixture', 'Shared notification ID',
               'https://example.com/test', $3, 'user_deleted')`,
      [userId, id, at, publicationRssFeedItemId],
    )
  }
}

export async function listTestSameIdNotificationOwners(
  query: TransactionQuery,
  id: string,
  users: string[],
): Promise<string[]> {
  const { rows } = await query<{ user_id: string }>(
    `/* listTestSameIdNotificationOwners */
     SELECT user_id FROM notifications WHERE id = $1 AND user_id = ANY($2::uuid[])`,
    [id, users],
  )
  return rows.map(row => row.user_id)
}
