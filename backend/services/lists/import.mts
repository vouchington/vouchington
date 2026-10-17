import { write } from '@data-stores/psql'
import assert from 'http-assert'
import { getListForWrite } from './lists.mts'
import { currentUserCanManageList } from './authorization.mts'
import { invalidate } from '@services/entity-cache/invalidate'

const IMPORT_FEED_ITEM_LIMIT = 20

export const importCommunityListPostsSourceSql = `/* importCommunityListPostsSource */
  SELECT $1::uuid, p.id
  FROM community_list_posts item
  JOIN posts p ON p.id = item.post_id AND p.deleted_at IS NULL
  WHERE item.community_id = $2
    AND item.removed_at IS NULL
  ORDER BY $1::uuid, p.id`

export const importCommunityListFeedItemsSourceSql = `/* importCommunityListFeedItemsSource */
  SELECT $1::uuid, rfi.id
  FROM community_list_rss_feeds item
  JOIN rss_feeds rf ON rf.id = item.rss_feed_id
    AND rf.deleted_at IS NULL
    AND rf.is_enabled = true
  JOIN LATERAL (
    SELECT rfi2.id
    FROM rss_feed_item_sources rfis
    JOIN rss_feed_items rfi2 ON rfi2.id = rfis.rss_feed_item_id AND rfi2.deleted_at IS NULL
    WHERE rfis.rss_feed_id = item.rss_feed_id
    ORDER BY rfi2.published_at DESC
    LIMIT $3
  ) rfi ON true
  WHERE item.community_id = $2
    AND item.removed_at IS NULL
  ORDER BY $1::uuid, rfi.id`

export async function importCommunityList(
  currentUserId: string,
  { communityId, targetListId }: { communityId: string; targetListId: string },
): Promise<{ posts: number; items: number }> {
  const list = await getListForWrite(targetListId)
  assert(list, 404, 'List not found')
  assert(currentUserCanManageList(currentUserId, list), 403, 'Forbidden')

  const { rowCount: postsCount } = await write(
    `/* importCommunityList:posts */
    INSERT INTO user_list_posts (user_list_id, post_id)
    ${importCommunityListPostsSourceSql}
    ON CONFLICT (user_list_id, post_id) WHERE removed_at IS NULL
    DO NOTHING`,
    [targetListId, communityId],
  )

  const { rowCount: itemsCount } = await write(
    `/* importCommunityList:feed-items */
    INSERT INTO user_list_rss_feed_items (user_list_id, rss_feed_item_id)
    ${importCommunityListFeedItemsSourceSql}
    ON CONFLICT (user_list_id, rss_feed_item_id) WHERE removed_at IS NULL
    DO NOTHING`,
    [targetListId, communityId, IMPORT_FEED_ITEM_LIMIT],
  )

  const imported = { posts: postsCount ?? 0, items: itemsCount ?? 0 }
  if (imported.posts > 0 || imported.items > 0) await invalidate.lists(targetListId)
  return imported
}
