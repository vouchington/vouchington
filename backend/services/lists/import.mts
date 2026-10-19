import { write } from '@data-stores/psql'
import { buildObjectPostAccessFilter } from '@services/entity-relations/post-access'
import type { EntityRelationViewer } from '@services/entity-relations/viewer'
import { invalidate } from '@services/entity-cache/invalidate'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ManageableList } from './manage.mts'

const IMPORT_FEED_ITEM_LIMIT = 20

/** Newest community-list posts copied in one import. `order_index` is a manual position, not recency. */
export const IMPORT_POST_LIMIT = 500

export function importCommunityListPostsSourceSql(
  targetListId: string,
  communityId: string,
  viewer: EntityRelationViewer,
): SQLStatement {
  const statement = sql`/* importCommunityListPostsSource */
    SELECT ${targetListId}::uuid, candidate_post.id
    FROM community_list_posts item
    JOIN posts candidate_post
      ON candidate_post.id = item.post_id
     AND candidate_post.deleted_at IS NULL
    JOIN posts access_post
      ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
     AND access_post.deleted_at IS NULL
    WHERE item.community_id = ${communityId}::uuid
      AND item.removed_at IS NULL
      AND `
  const eligibility = buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'named')
  statement.append(eligibility ?? sql`TRUE`)
  statement.append(sql`
    ORDER BY item.id DESC
    LIMIT ${IMPORT_POST_LIMIT}`)
  return statement
}

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

/**
 * Copies a community's posts and feed items into a list the caller already loaded through
 * `getManageableList`, which has answered the 404 and 403 for it. Posts use the same named-scope
 * eligibility as adding one post, and only the newest `IMPORT_POST_LIMIT` qualify.
 */
export async function importCommunityList(
  targetList: ManageableList,
  { communityId, viewer }: { communityId: string; viewer: EntityRelationViewer },
): Promise<{ posts: number; items: number }> {
  const targetListId = targetList.id
  const postsSource = importCommunityListPostsSourceSql(targetListId, communityId, viewer)
  const insertPosts = sql`/* importCommunityList:posts */
    INSERT INTO user_list_posts (user_list_id, post_id)
    `.append(postsSource).append(sql`
    ON CONFLICT (user_list_id, post_id) WHERE removed_at IS NULL
    DO NOTHING`)

  const { rowCount: postsCount } = await write(insertPosts)

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
