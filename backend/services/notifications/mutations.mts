import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getNotificationsWorkLimit } from './work-limits.mts'
import { enqueueMarkAllNotificationsReadContinuation } from '@queues/notifications/enqueues/mark-all-read'

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

/**
 * Resolves the navigation target of one of the user's notifications. With `markRead` the same
 * statement also records the read state; without it nothing is written.
 */
export async function getNotificationRedirectTarget(
  userId: string,
  notificationId: string,
  options: { markRead: boolean },
) {
  const { rows } = await write(sql`/* getNotificationRedirectTarget */
    WITH target AS (
      SELECT user_id, id, target_path
      FROM notifications
      WHERE user_id = ${userId}
        AND id = ${notificationId}
        AND deleted_at IS NULL
    ),
    marked AS (
      UPDATE notifications
      SET read_at = COALESCE(notifications.read_at, CURRENT_TIMESTAMP)
      FROM target
      WHERE ${options.markRead}::boolean
        AND notifications.user_id = target.user_id
        AND notifications.id = target.id
    )
    SELECT target_path FROM target
  `)

  return (rows[0]?.target_path as string | undefined) ?? null
}

export type MarkAllNotificationsReadPage =
  | { marked_read: number; has_more: true; through_id: string; last_page_id: string }
  | {
      marked_read: number
      has_more: false
      through_id: string | null
      last_page_id: string | null
    }

/** One atomic page. The first call fixes an upper ID for background continuation. */
export async function markAllNotificationsRead(
  userId: string,
  throughId: string | null = null,
): Promise<MarkAllNotificationsReadPage> {
  const pageSize = getNotificationsWorkLimit('mark_all_read_page_size')
  const { rows } = await write(sql`/* markAllNotificationsRead */
    WITH boundary AS MATERIALIZED (
      SELECT id
      FROM notifications
      WHERE user_id = ${userId}
        AND ${throughId}::uuid IS NULL
        AND deleted_at IS NULL
        AND read_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    ), candidates AS MATERIALIZED (
      SELECT n.user_id, n.id
      FROM notifications n
      WHERE n.user_id = ${userId}
        AND n.deleted_at IS NULL
        AND n.read_at IS NULL
        AND n.id <= COALESCE(${throughId}::uuid, (SELECT id FROM boundary))
      ORDER BY n.id
      LIMIT ${pageSize + 1}
      FOR UPDATE
    ), page AS MATERIALIZED (
      SELECT user_id, id FROM candidates ORDER BY id LIMIT ${pageSize}
    ), marked AS (
      UPDATE notifications n
      SET read_at = CURRENT_TIMESTAMP
      FROM page
      WHERE n.user_id = page.user_id AND n.id = page.id
        AND n.deleted_at IS NULL AND n.read_at IS NULL
      RETURNING n.id
    )
    SELECT
      (SELECT count(*)::integer FROM marked) AS marked_read,
      (SELECT count(*) FROM candidates) > ${pageSize} AS has_more,
      COALESCE(${throughId}::uuid, (SELECT id FROM boundary)) AS through_id,
      (SELECT id FROM marked ORDER BY id DESC LIMIT 1) AS last_page_id
  `)

  const result = rows[0] as MarkAllNotificationsReadPage
  if (result.has_more) {
    // The extra locked candidate implies a nonempty marked page and an upper ID.
    await enqueueMarkAllNotificationsReadContinuation({
      userId,
      throughId: result.through_id,
      lastPageId: result.last_page_id,
    })
  }
  return result
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
