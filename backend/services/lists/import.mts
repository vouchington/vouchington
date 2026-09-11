import { write } from '@data-stores/psql'
import assert from 'http-assert'
import { getListForWrite } from './lists.mts'
import { currentUserCanManageList } from './authorization.mts'
import { invalidate } from '@services/entity-cache/invalidate'

const IMPORT_FEED_ITEM_LIMIT = 20

export async function importCommunityList(
  currentUserId: string,
  { communityId, targetListId }: { communityId: string; targetListId: string },
): Promise<{ posts: number; items: number }> {
  const list = await getListForWrite(targetListId)
  assert(list, 404, 'List not found')
  assert(currentUserCanManageList(currentUserId, list), 403, 'Forbidden')

  const { rowCount: postsCount } = await write(
    `/* importCommunityList:posts */
    INSERT INTO list_items__posts (list_id, post_id)
    SELECT $1::uuid, vcli.entity_id::uuid
    FROM view_community_list_items vcli
    JOIN posts p ON p.id = vcli.entity_id::uuid AND p.deleted_at IS NULL
    WHERE vcli.community_id = $2
      AND vcli.item_type = 'post'
    ORDER BY $1::uuid, vcli.entity_id::uuid
    ON CONFLICT (list_id, post_id) WHERE removed_at IS NULL
    DO NOTHING`,
    [targetListId, communityId],
  )

  const { rowCount: itemsCount } = await write(
    `/* importCommunityList:feed-items */
    INSERT INTO list_items__rss_feed_items (list_id, rss_feed_item_id)
    SELECT $1::uuid, rfi.id
    FROM view_community_list_items vcli
    JOIN rss_feeds rf ON rf.id = vcli.entity_id::uuid
      AND rf.deleted_at IS NULL
      AND rf.is_enabled = true
    JOIN LATERAL (
      SELECT rfi2.id
      FROM rss_feed_item_sources rfis
      JOIN rss_feed_items rfi2 ON rfi2.id = rfis.rss_feed_item_id AND rfi2.deleted_at IS NULL
      WHERE rfis.rss_feed_id = vcli.entity_id::uuid
      ORDER BY rfi2.published_at DESC
      LIMIT $3
    ) rfi ON true
    WHERE vcli.community_id = $2
      AND vcli.item_type = 'rss_feed'
    ORDER BY $1::uuid, rfi.id
    ON CONFLICT (list_id, rss_feed_item_id) WHERE removed_at IS NULL
    DO NOTHING`,
    [targetListId, communityId, IMPORT_FEED_ITEM_LIMIT],
  )

  const imported = { posts: postsCount ?? 0, items: itemsCount ?? 0 }
  if (imported.posts > 0 || imported.items > 0) await invalidate.lists(targetListId)
  return imported
}
