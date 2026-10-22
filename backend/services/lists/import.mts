import { write } from '@data-stores/psql'
import { buildObjectPostAccessFilter } from '@services/entity-relations/post-access'
import type { EntityRelationViewer } from '@services/entity-relations/viewer'
import { invalidate } from '@services/entity-cache/invalidate'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ManageableList } from './manage.mts'
import { getListImportLimit } from './import-config.mts'

const IMPORT_FEED_ITEM_LIMIT = 20

export function importCommunityListPostsSourceSql(
  targetListId: string,
  communityId: string,
  viewer: EntityRelationViewer,
  limit: number,
  delegated?: { grantedScopes: readonly string[]; credentialOwnerId: string },
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
  const eligibility = buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'listed')
  statement.append(eligibility ?? sql`TRUE`)
  if (delegated) {
    const ownsPrivate = delegated.grantedScopes.includes('post-relations.owned-private:write')
    statement.append(sql`
      AND NOT (
        access_post.privacy = 'private'
        AND (
          ${!ownsPrivate}
          OR candidate_post.created_by_id IS DISTINCT FROM ${delegated.credentialOwnerId}::uuid
          OR access_post.created_by_id IS DISTINCT FROM ${delegated.credentialOwnerId}::uuid
        )
      )`)
  }
  statement.append(sql`
    ORDER BY item.id DESC
    LIMIT ${limit}`)
  return statement
}

export const importCommunityListFeedItemsSourceSql = `/* importCommunityListFeedItemsSource */
  SELECT $1::uuid, rfi.id
  FROM community_list_rss_feeds item
  JOIN rss_feeds rf ON rf.id = item.rss_feed_id
    AND rf.deleted_at IS NULL
    AND rf.is_enabled = true
  JOIN LATERAL (
    SELECT rfi2.id, rfi2.published_at
    FROM rss_feed_item_sources rfis
    JOIN rss_feed_items rfi2 ON rfi2.id = rfis.rss_feed_item_id AND rfi2.deleted_at IS NULL
    WHERE rfis.rss_feed_id = item.rss_feed_id
    ORDER BY rfi2.published_at DESC
    LIMIT $3
  ) rfi ON true
  WHERE item.community_id = $2
    AND item.removed_at IS NULL
  ORDER BY rfi.published_at DESC, rfi.id DESC
  LIMIT $4`

/**
 * Copies a community's posts and feed items into a list the caller already loaded through
 * `getManageableList`, which has answered the 404 and 403 for it. Posts use list-read discovery
 * eligibility. A delegated copy also drops a private root the items path would refuse. Each
 * source is bounded by the same runtime limit.
 */
export async function importCommunityList(
  targetList: ManageableList,
  {
    communityId,
    viewer,
    delegated,
  }: {
    communityId: string
    viewer: EntityRelationViewer
    delegated?: { grantedScopes: readonly string[]; credentialOwnerId: string }
  },
): Promise<{ posts: number; items: number }> {
  const targetListId = targetList.id
  const limit = getListImportLimit()
  const postsSource = importCommunityListPostsSourceSql(
    targetListId,
    communityId,
    viewer,
    limit,
    delegated,
  )
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
    [targetListId, communityId, IMPORT_FEED_ITEM_LIMIT, limit],
  )

  const imported = { posts: postsCount ?? 0, items: itemsCount ?? 0 }
  if (imported.posts > 0 || imported.items > 0) await invalidate.lists(targetListId)
  return imported
}
