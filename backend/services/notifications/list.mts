import { read } from '@data-stores/psql'
import type {
  NotificationsResponseBody,
  NotificationsUnreadSummaryResponseBody,
} from '@voucha/api/types'
import sql from 'sql-template-strings'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import { hydrateNotifications } from './hydrate-notifications.mts'
import { mapNotificationRow } from './shared.mts'
import type { NotificationResult } from './types.mts'

export async function listNotifications(
  userId: string,
  options?: { after?: string; limit?: number },
) {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)
  let afterId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* listNotifications */
    SELECT
      id,
      user_id,
      entity_type,
      kind,
      params,
      post_id,
      rss_feed_item_id,
      actor_user_id,
      sent_by_id,
      moderation_report_id,
      review_dispute_id,
      user_warning_id,
      moderation_appeal_id,
      conversation_id,
      community_id,
      community_application_id,
      household_id,
      copyright_notice_id,
      copyright_notice_delivery_work_item_id,
      top_post_id,
      event_key,
      target_path,
      fn_notification_target_entity(entity_type, community_id, household_id) AS target_entity,
      target_intent,
      read_at,
      pushed_at,
      deleted_at,
      created_at,
      updated_at
    FROM notifications
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
  `

  if (afterId) {
    query.append(sql` AND id < ${afterId}`)
  }

  query.append(sql`
    ORDER BY id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query)
  const hasNextPage = rows.length > limit
  const notifications: NotificationsResponseBody['notifications'] = {}
  const results: NotificationResult[] = []
  for (const row of rows) {
    if (results.length >= limit) break
    const notification = mapNotificationRow(row as Record<string, unknown>)
    notifications[notification.id] = notification
    results.push({
      __entity_type: 'notification',
      id: notification.id,
      read_at: notification.read_at,
    })
  }

  return {
    results,
    notifications,
    ...(await hydrateNotifications(userId, Object.values(notifications))),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeCursor({ id: results[0].id }) : null,
      end_cursor: hasNextPage && results.at(-1) ? encodeCursor({ id: results.at(-1)!.id }) : null,
    },
  } satisfies NotificationsResponseBody
}

export async function getUnreadNotificationsSummary(
  userId: string,
  limit = 10,
): Promise<NotificationsUnreadSummaryResponseBody> {
  const safeLimit = Math.min(Math.max(limit, 1), 20)
  const { rows } = await read(sql`/* getUnreadNotificationsSummary */
    SELECT
      COUNT(*) OVER()::int AS unread_count,
      id,
      user_id,
      entity_type,
      kind,
      params,
      post_id,
      rss_feed_item_id,
      actor_user_id,
      sent_by_id,
      moderation_report_id,
      review_dispute_id,
      user_warning_id,
      moderation_appeal_id,
      conversation_id,
      community_id,
      community_application_id,
      household_id,
      copyright_notice_id,
      copyright_notice_delivery_work_item_id,
      top_post_id,
      event_key,
      target_path,
      fn_notification_target_entity(entity_type, community_id, household_id) AS target_entity,
      target_intent,
      read_at,
      pushed_at,
      deleted_at,
      created_at,
      updated_at
    FROM notifications
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
      AND read_at IS NULL
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `)

  const notifications = Object.fromEntries(
    rows.map(row => {
      const notification = mapNotificationRow(row as Record<string, unknown>)
      return [notification.id, notification]
    }),
  )

  return {
    unread_count: (rows[0]?.unread_count as number | undefined) ?? 0,
    results: rows.map(row => ({
      __entity_type: 'notification',
      id: row.id as string,
      read_at: (row.read_at as Date | null) ?? null,
    })),
    notifications,
    ...(await hydrateNotifications(userId, Object.values(notifications))),
  }
}
