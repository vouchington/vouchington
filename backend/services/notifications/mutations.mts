import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markNotificationRead(userId: string, notificationId: string) {
  const { rowCount } = await write(sql`/* markNotificationRead */
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ${userId}
      AND id = ${notificationId}
      AND deleted_at IS NULL
  `)

  return (rowCount ?? 0) > 0
}

export async function markNotificationReadAndGetRedirectTarget(
  userId: string,
  notificationId: string,
) {
  const { rows } = await write(sql`/* markNotificationReadAndGetRedirectTarget */
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ${userId}
      AND id = ${notificationId}
      AND deleted_at IS NULL
    RETURNING target_path
  `)

  return (rows[0]?.target_path as string | undefined) ?? null
}

export async function markAllNotificationsRead(userId: string) {
  const { rowCount } = await write(sql`/* markAllNotificationsRead */
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
      AND read_at IS NULL
  `)

  return rowCount ?? 0
}

export async function deleteNotification(userId: string, notificationId: string) {
  const { rowCount } = await write(sql`/* deleteNotification */
    UPDATE notifications
    SET deleted_at = CURRENT_TIMESTAMP,
        delete_reason = 'user_deleted'
    WHERE user_id = ${userId}
      AND id = ${notificationId}
      AND deleted_at IS NULL
  `)

  return (rowCount ?? 0) > 0
}

export async function hasNotification(userId: string, notificationId: string) {
  const { rows } = await read(sql`/* hasNotification */
    SELECT 1
    FROM notifications
    WHERE user_id = ${userId}
      AND id = ${notificationId}
      AND deleted_at IS NULL
    LIMIT 1
  `)

  return rows.length > 0
}
