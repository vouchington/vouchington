import type { TransactionQuery } from '@data-stores/psql'

export async function getTestNotificationEmailRetentionCursor(
  query: TransactionQuery,
  name: string,
): Promise<{ cursor_notification_id: string | null; sweep_cutoff_at: Date | null } | null> {
  const { rows } = await query<{
    cursor_notification_id: string | null
    sweep_cutoff_at: Date | null
  }>(
    `/* getTestNotificationEmailRetentionCursor */
     SELECT cursor_notification_id, sweep_cutoff_at
     FROM notification_email_retention_cleanup_cursors WHERE cleanup_name::text = $1`,
    [name],
  )
  return rows[0] ?? null
}
