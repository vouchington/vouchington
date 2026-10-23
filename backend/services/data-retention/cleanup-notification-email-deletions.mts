import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { Candidate } from './cleanup-notification-email-candidates.mts'
import type { NotificationEmailCleanupName } from './cleanup-notification-email.mts'

export async function deleteNotificationEmailPage(
  query: TransactionQuery,
  name: NotificationEmailCleanupName,
  page: Candidate[],
  cutoff: Date,
): Promise<number> {
  if (page.length === 0) return 0
  const ids = page.map(row => row.id)
  if (name === 'ses_bounce_events') {
    // This transaction-local exact-id capability is checked again by the append-only trigger.
    // ast-grep-ignore: no-three-sequential-awaits -- authorize exact IDs, delete under the trigger guard, then revoke in this transaction
    await query(
      `/* authorizeSesBounceRetention */
       SELECT set_config('app.ses_bounce_retention_ids', $1, true),
              set_config('app.ses_bounce_retention_cutoff', $2, true)`,
      [ids.join(','), cutoff.toISOString()],
    )
    const deleted = await query(
      `/* deleteSesBouncePage */
       DELETE FROM amazon_ses_bounce_events
       WHERE id = ANY($1::uuid[]) AND id < $2::uuid`,
      [ids, getMinUUIDv7ForDate(cutoff)],
    )
    await query(
      `/* endSesBounceRetention */
       SELECT set_config('app.ses_bounce_retention_ids', '', true),
              set_config('app.ses_bounce_retention_cutoff', '', true)`,
    )
    return deleted.rowCount ?? 0
  }
  if (name === 'moderation_email_sends') {
    const deleted = await query(
      `/* deleteModerationEmailSendPage */
       DELETE FROM user_moderation_email_sends WHERE id = ANY($1::uuid[])`,
      [ids],
    )
    return deleted.rowCount ?? 0
  }
  // The bounded candidate page probes only indexed source PKs and the exact push-intent key.
  // A surviving source can still reconcile, and a surviving intent still owns delivery effects.
  const deleted = await query(
    `/* deleteNotificationTombstonePage */
     DELETE FROM notifications notification
     WHERE notification.user_id = ANY($1::uuid[])
       AND (notification.user_id, notification.id) IN
       (SELECT * FROM unnest($1::uuid[], $2::uuid[]))
       AND notification.deleted_at IS NOT NULL
       AND notification.delete_reason = $3::notification_delete_reasons
       AND notification.entity_type <> 'copyright_notice'
       AND notification.event_key IS NULL
       AND (
         notification.post_id IS NOT NULL OR notification.publication_post_id IS NOT NULL
         OR notification.rss_feed_item_id IS NOT NULL
         OR notification.publication_rss_feed_item_id IS NOT NULL
       )
       AND NOT EXISTS (SELECT 1 FROM posts WHERE id = notification.post_id)
       AND NOT EXISTS (SELECT 1 FROM posts WHERE id = notification.publication_post_id)
       AND NOT EXISTS (SELECT 1 FROM rss_feed_items WHERE id = notification.rss_feed_item_id)
       AND NOT EXISTS (SELECT 1 FROM rss_feed_items WHERE id = notification.publication_rss_feed_item_id)
       AND NOT EXISTS (
         SELECT 1 FROM notification_push_intents intent
         WHERE intent.user_id = notification.user_id AND intent.notification_id = notification.id
       )`,
    [
      page.map(row => {
        if (!row.user_id) throw new Error('Notification retention candidate lacks user_id')
        return row.user_id
      }),
      ids,
      name === 'system_pruned_notifications' ? 'system_pruned' : 'user_deleted',
    ],
  )
  return deleted.rowCount ?? 0
}
