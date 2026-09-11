import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type NotificationPushInput = { userId: string; notificationId: string }

/** Ensures replayed pre-capture notifications enter the durable delivery path. */
export async function ensureNotificationPushIntents(
  notifications: NotificationPushInput[],
  options: QueryOptions = {},
): Promise<number> {
  const deduped = [
    ...new Map(notifications.map(item => [`${item.userId}:${item.notificationId}`, item])).values(),
  ]
  if (deduped.length === 0) return 0
  const statement = sql`/* ensureNotificationPushIntents */
    WITH requested AS MATERIALIZED (
      SELECT *
      FROM UNNEST(
        ${deduped.map(item => item.userId)}::uuid[],
        ${deduped.map(item => item.notificationId)}::uuid[]
      ) AS requested(user_id, notification_id)
    ), eligible AS MATERIALIZED (
      SELECT notification.user_id, notification.id AS notification_id
      FROM notifications notification
      JOIN requested
        ON requested.user_id = notification.user_id
        AND requested.notification_id = notification.id
      WHERE notification.deleted_at IS NULL AND notification.pushed_at IS NULL
    ), inserted AS (
      INSERT INTO notification_push_intents (user_id, notification_id)
      SELECT user_id, notification_id FROM eligible ORDER BY user_id, notification_id
      ON CONFLICT (user_id, notification_id) DO NOTHING
    )
    SELECT COUNT(*)::integer AS eligible_count FROM eligible
  `
  const { rows } = options.query
    ? await options.query<{ eligible_count: number }>(statement)
    : await write<{ eligible_count: number }>(statement)
  return rows[0]?.eligible_count ?? 0
}
