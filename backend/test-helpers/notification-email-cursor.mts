import type { TransactionQuery } from '@data-stores/psql'

export async function getTestNotificationEmailRetentionCursor(
  query: TransactionQuery,
  name: string,
): Promise<{ cursor_position: string | null; sweep_cutoff_at: Date | null } | null> {
  const { rows } = await query<{
    cursor_position: string | null
    sweep_cutoff_at: Date | null
  }>(
    `/* getTestNotificationEmailRetentionCursor */
     SELECT cursor_position, sweep_cutoff_at
     FROM notification_email_retention_cleanup_cursors WHERE cleanup_name = $1`,
    [name],
  )
  return rows[0] ?? null
}
