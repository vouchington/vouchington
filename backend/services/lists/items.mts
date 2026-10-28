import { clampLimit } from '@services/pagination'
import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import { getListItemStorageConfig } from './catalog.mts'
import { listPostDiscoveryFilter } from './listable.mts'
import type { ListItem, ListItemType } from './types.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { rowToListItem } from './item-row.mts'
export { addListItem } from './add-item.mts'

export async function removeListItem(
  listId: string,
  itemType: ListItemType,
  entityId: string,
): Promise<void> {
  const { table, entityColumn } = getListItemStorageConfig(itemType)

  const { rows } = await write(
    `/* removeListItem */
    UPDATE ${table}
    SET removed_at = NOW()
    WHERE user_list_id = $1
      AND ${entityColumn} = $2
      AND removed_at IS NULL
    RETURNING id
    `,
    [listId, entityId],
  )
  assert(rows.length > 0, 404, 'List item not found')
  await invalidate.lists(listId)
}

export async function searchListItems(
  listId: string,
  options: {
    limit?: number
    after?: string
    mediaType?: string
    read?: boolean
    currentUserId?: string
    isAdministrator?: boolean
  } = {},
): Promise<{ results: ListItem[]; page_info: PageInfo }> {
  const requestedLimit = options.limit ?? clampLimit(undefined, 20)
  assert(Number.isInteger(requestedLimit), 422, 'limit must be an integer')
  assert(requestedLimit > 0 && requestedLimit <= 100, 422, 'limit must be between 1 and 100')
  const limit = clampLimit(requestedLimit, 20)

  const query = sql`/* searchListItems */
    WITH list_items AS (
      SELECT li.id, li.user_list_id AS list_id,
        'rss_feed_item'::user_list_item_types AS item_type,
        li.rss_feed_item_id AS entity_id, li.order_index, li.created_at,
        rfi.media_type::text AS media_type,
        COALESCE(NULLIF(BTRIM(rfi.data->>'title'), ''), article_url.url) AS entity_label
      FROM user_list_rss_feed_items li
      JOIN rss_feed_items rfi ON rfi.id = li.rss_feed_item_id AND rfi.deleted_at IS NULL
      JOIN urls article_url ON article_url.id = rfi.url_id
      WHERE li.user_list_id = ${listId}::uuid AND li.removed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM rss_feed_item_sources source
          JOIN rss_feeds feed ON feed.id = source.rss_feed_id
            AND feed.deleted_at IS NULL AND feed.is_enabled = true
          WHERE source.rss_feed_item_id = rfi.id
        )
      UNION ALL
      SELECT li.id, li.user_list_id AS list_id,
        'post'::user_list_item_types AS item_type,
        li.post_id AS entity_id, li.order_index, li.created_at,
        NULL::text AS media_type,
        COALESCE(NULLIF(BTRIM(candidate_post.title), ''),
          (SELECT MIN(slug) FROM post_slugs WHERE post_id = candidate_post.id),
          LEFT(NULLIF(BTRIM(candidate_post.markdown), ''), 80),
          LEFT(NULLIF(BTRIM(candidate_post.ai_summary_markdown), ''), 80),
          LEFT(NULLIF(candidate_post.markdown, ''), 80),
          LEFT(NULLIF(candidate_post.ai_summary_markdown, ''), 80)) AS entity_label
      FROM user_list_posts li
      JOIN posts candidate_post
        ON candidate_post.id = li.post_id AND candidate_post.deleted_at IS NULL
      JOIN posts root_post
        ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
       AND root_post.deleted_at IS NULL
      WHERE li.user_list_id = ${listId}::uuid AND li.removed_at IS NULL
        AND `
  query.append(listPostDiscoveryFilter(options.currentUserId, options.isAdministrator === true))
  query.append(sql`
    )
    SELECT id, list_id, item_type, entity_id, order_index, created_at, media_type, entity_label
    FROM list_items
    WHERE true`)

  if (options.mediaType) query.append(sql` AND media_type = ${options.mediaType}`)

  if (options.read !== undefined && options.currentUserId) {
    const userId = options.currentUserId
    const readExists = sql`(
      CASE
        WHEN item_type = 'rss_feed_item' THEN EXISTS (
          SELECT 1 FROM rss_feed_item_read_states
          WHERE user_id = ${userId}::uuid AND rss_feed_item_id = entity_id::uuid)
        WHEN item_type = 'post' THEN EXISTS (
          SELECT 1 FROM post_read_states
          WHERE user_id = ${userId}::uuid AND post_id = entity_id::uuid)
        ELSE NULL
      END
    )`
    query.append(options.read ? sql` AND ` : sql` AND NOT `).append(readExists)
  }

  if (options.after) {
    const cursor = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor format: expected id cursor',
    )
    query.append(sql` AND id < ${cursor.id}::uuid`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit).map(row => rowToListItem(row, row.item_type as ListItemType))

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: r => ({ id: r.id }),
    }),
  }
}
