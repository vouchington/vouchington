import { writePool } from '@data-stores/psql'
import { getPostNotificationSnapshot } from './reconcile-post-snapshot.mts'
import { getRssFeedItemNotificationSnapshot } from './reconcile-rss-feed-item-snapshot.mts'
import { getNotificationsWorkLimit } from './work-limits.mts'

export type ContentVisibilityCursor = { userId: string; notificationId: string }
export type ContentVisibilityPage = {
  updated: number
  pruned: number
  nextCursor?: ContentVisibilityCursor
}

/** One statement updates at most one configured page. A continuation reads eligibility anew. */
export async function reconcilePostContentNotificationVisibility(
  postId: string,
  after?: ContentVisibilityCursor,
): Promise<ContentVisibilityPage> {
  const post = await getPostNotificationSnapshot(postId)
  const pageSize = getNotificationsWorkLimit('content_visibility_page_size')
  const { rows } = await writePool.query<{ user_id: string; id: string; deleted_at: Date | null }>(
    `/* reconcilePostContentNotificationVisibility */
      WITH targets AS MATERIALIZED (
        SELECT notification.user_id, notification.id
        FROM notifications notification
        WHERE notification.publication_post_id = $1
          AND notification.entity_type = 'post'
          AND ($2::uuid IS NULL OR (notification.user_id, notification.id) > ($2::uuid, $3::uuid))
          AND (
            (notification.delivery_type = 'manual_send'
              AND $4::boolean
              AND notification.deleted_at IS NOT NULL
              AND notification.delete_reason = 'system_pruned')
            OR (notification.deleted_at IS NULL
              AND (notification.delivery_type = 'manual_send'
                OR notification.target_path ~ '^/(posts|reviews|data-points|link|discussion|review|data-point)/')
              AND ((notification.delivery_type = 'subscription'
                  AND NOT $5::boolean AND notification.read_at IS NULL)
                OR (notification.delivery_type = 'manual_send' AND NOT $4::boolean)))
          )
        ORDER BY notification.user_id, notification.id
        LIMIT $6
        FOR UPDATE OF notification
      ), changed AS (
        UPDATE notifications notification
        SET deleted_at = CASE WHEN notification.delivery_type = 'manual_send' AND $4::boolean
            THEN NULL ELSE CURRENT_TIMESTAMP END,
            delete_reason = CASE WHEN notification.delivery_type = 'manual_send' AND $4::boolean
            THEN NULL ELSE 'system_pruned'::notification_delete_reasons END
        FROM targets
        WHERE notification.user_id = targets.user_id AND notification.id = targets.id
        RETURNING notification.user_id, notification.id, notification.deleted_at
      )
      SELECT user_id, id, deleted_at FROM changed ORDER BY user_id, id`,
    [
      postId,
      after?.userId ?? null,
      after?.notificationId ?? null,
      post?.is_manual_send_content_eligible ?? false,
      post?.is_content_eligible ?? false,
      pageSize,
    ],
  )
  return pageResult(rows, pageSize)
}

/** RSS item visibility uses the same bounded keyset and a fresh source snapshot per page. */
export async function reconcileRssFeedItemContentNotificationVisibility(
  rssFeedItemId: string,
  after?: ContentVisibilityCursor,
): Promise<ContentVisibilityPage> {
  const item = await getRssFeedItemNotificationSnapshot(rssFeedItemId)
  const pageSize = getNotificationsWorkLimit('content_visibility_page_size')
  const { rows } = await writePool.query<{ user_id: string; id: string; deleted_at: Date | null }>(
    `/* reconcileRssFeedItemContentNotificationVisibility */
      WITH targets AS MATERIALIZED (
        SELECT notification.user_id, notification.id
        FROM notifications notification
        WHERE notification.publication_rss_feed_item_id = $1
          AND notification.entity_type = 'rss_feed_item'
          AND ($2::uuid IS NULL OR (notification.user_id, notification.id) > ($2::uuid, $3::uuid))
          AND (
            ($4::boolean AND notification.delivery_type = 'manual_send'
              AND notification.deleted_at IS NOT NULL
              AND notification.delete_reason = 'system_pruned')
            OR (NOT $4::boolean AND notification.deleted_at IS NULL
              AND (notification.delivery_type = 'manual_send' OR notification.read_at IS NULL))
          )
        ORDER BY notification.user_id, notification.id
        LIMIT $5
        FOR UPDATE OF notification
      ), changed AS (
        UPDATE notifications notification
        SET deleted_at = CASE WHEN $4::boolean THEN NULL ELSE CURRENT_TIMESTAMP END,
            delete_reason = CASE WHEN $4::boolean THEN NULL
              ELSE 'system_pruned'::notification_delete_reasons END
        FROM targets
        WHERE notification.user_id = targets.user_id AND notification.id = targets.id
        RETURNING notification.user_id, notification.id, notification.deleted_at
      )
      SELECT user_id, id, deleted_at FROM changed ORDER BY user_id, id`,
    [
      rssFeedItemId,
      after?.userId ?? null,
      after?.notificationId ?? null,
      item?.is_content_eligible ?? false,
      pageSize,
    ],
  )
  return pageResult(rows, pageSize)
}

function pageResult(
  rows: Array<{ user_id: string; id: string; deleted_at: Date | null }>,
  pageSize: number,
): ContentVisibilityPage {
  const last = rows.at(-1)
  return {
    updated: rows.length,
    pruned: rows.filter(row => row.deleted_at !== null).length,
    ...(rows.length === pageSize && last
      ? { nextCursor: { userId: last.user_id, notificationId: last.id } }
      : {}),
  }
}
