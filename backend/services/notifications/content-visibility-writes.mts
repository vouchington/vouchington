import { writePool } from '@data-stores/psql'
import { getPostNotificationSnapshot } from './reconcile-post-snapshot.mts'
import { getRssFeedItemNotificationSnapshot } from './reconcile-rss-feed-item-snapshot.mts'
import { getContentVisibilityPageLimit } from './work-limits.mts'

export type ContentVisibilityCursor = { userId: string; notificationId: string }
const FIRST_UUID = '00000000-0000-0000-0000-000000000000'
export type ContentVisibilityPage = {
  updated: number
  pruned: number
  nextCursor?: ContentVisibilityCursor
}

/** One statement scans at most one configured target page. A continuation reads eligibility anew. */
export async function reconcilePostContentNotificationVisibility(
  postId: string,
  after?: ContentVisibilityCursor,
): Promise<ContentVisibilityPage> {
  const post = await getPostNotificationSnapshot(postId)
  const pageSize = getContentVisibilityPageLimit()
  const cursorOperator = after ? '>' : '>='
  const { rows } = await writePool.query<VisibilityPageRow>(
    `/* reconcilePostContentNotificationVisibility */
      WITH target_page AS MATERIALIZED (
        SELECT notification.user_id, notification.id
        FROM notifications notification
        WHERE notification.publication_post_id = $1
          AND (notification.user_id, notification.id) ${cursorOperator} ($2::uuid, $3::uuid)
        ORDER BY notification.user_id, notification.id
        LIMIT $6
        FOR UPDATE OF notification
      ), changed AS (
        UPDATE notifications notification
        SET deleted_at = CASE WHEN notification.delivery_type = 'manual_send' AND $4::boolean
            THEN NULL ELSE CURRENT_TIMESTAMP END,
            delete_reason = CASE WHEN notification.delivery_type = 'manual_send' AND $4::boolean
            THEN NULL ELSE 'system_pruned'::notification_delete_reasons END
        FROM target_page
        WHERE notification.user_id = target_page.user_id AND notification.id = target_page.id
          AND notification.entity_type = 'post'
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
        RETURNING notification.user_id, notification.id, notification.deleted_at
      )
      SELECT target_page.user_id, target_page.id, changed.id AS changed_id, changed.deleted_at
      FROM target_page
      LEFT JOIN changed USING (user_id, id)
      ORDER BY target_page.user_id, target_page.id`,
    [
      postId,
      after?.userId ?? FIRST_UUID,
      after?.notificationId ?? FIRST_UUID,
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
  const pageSize = getContentVisibilityPageLimit()
  const cursorOperator = after ? '>' : '>='
  const { rows } = await writePool.query<VisibilityPageRow>(
    `/* reconcileRssFeedItemContentNotificationVisibility */
      WITH target_page AS MATERIALIZED (
        SELECT notification.user_id, notification.id
        FROM notifications notification
        WHERE notification.publication_rss_feed_item_id = $1
          AND (notification.user_id, notification.id) ${cursorOperator} ($2::uuid, $3::uuid)
        ORDER BY notification.user_id, notification.id
        LIMIT $5
        FOR UPDATE OF notification
      ), changed AS (
        UPDATE notifications notification
        SET deleted_at = CASE WHEN $4::boolean THEN NULL ELSE CURRENT_TIMESTAMP END,
            delete_reason = CASE WHEN $4::boolean THEN NULL
              ELSE 'system_pruned'::notification_delete_reasons END
        FROM target_page
        WHERE notification.user_id = target_page.user_id AND notification.id = target_page.id
          AND notification.entity_type = 'rss_feed_item'
          AND (
            ($4::boolean AND notification.delivery_type = 'manual_send'
              AND notification.deleted_at IS NOT NULL
              AND notification.delete_reason = 'system_pruned')
            OR (NOT $4::boolean AND notification.deleted_at IS NULL
              AND (notification.delivery_type = 'manual_send' OR notification.read_at IS NULL))
          )
        RETURNING notification.user_id, notification.id, notification.deleted_at
      )
      SELECT target_page.user_id, target_page.id, changed.id AS changed_id, changed.deleted_at
      FROM target_page
      LEFT JOIN changed USING (user_id, id)
      ORDER BY target_page.user_id, target_page.id`,
    [
      rssFeedItemId,
      after?.userId ?? FIRST_UUID,
      after?.notificationId ?? FIRST_UUID,
      item?.is_content_eligible ?? false,
      pageSize,
    ],
  )
  return pageResult(rows, pageSize)
}

type VisibilityPageRow = {
  user_id: string
  id: string
  changed_id: string | null
  deleted_at: Date | null
}

function pageResult(rows: VisibilityPageRow[], pageSize: number): ContentVisibilityPage {
  const last = rows.at(-1)
  return {
    updated: rows.filter(row => row.changed_id !== null).length,
    pruned: rows.filter(row => row.changed_id !== null && row.deleted_at !== null).length,
    ...(rows.length === pageSize && last
      ? { nextCursor: { userId: last.user_id, notificationId: last.id } }
      : {}),
  }
}
