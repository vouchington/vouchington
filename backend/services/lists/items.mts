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

function rowToListItem(row: Record<string, unknown>, itemType: ListItemType): ListItem {
  return {
    __entity_type: 'list_item',
    id: row.id as string,
    list_id: row.list_id as string,
    item_type: itemType,
    entity_id: row.entity_id as string,
    order_index: (row.order_index as number) ?? 0,
    created_at: row.created_at as Date,
    media_type: (row.media_type as string | null) ?? null,
  }
}

export async function addListItem(
  listId: string,
  itemType: ListItemType,
  entityId: string,
): Promise<ListItem> {
  const { table, entityColumn } = getListItemStorageConfig(itemType)
  assert(table && entityColumn, 500, 'unknown item type')

  const { rows } = await write(
    `/* addListItem */
    -- Dynamic table and column come from the closed list-item storage catalog; VALUES is one row.
    /* no-mistakes: deadlock-safe */
    INSERT INTO ${table} (user_list_id, ${entityColumn})
    VALUES ($1, $2)
    RETURNING id, user_list_id AS list_id, ${entityColumn} AS entity_id, order_index, created_at
    `,
    [listId, entityId],
  ).catch(async (err: unknown) => {
    const code = (err as { code?: string }).code
    if (code === '23505') {
      // write() not read() to avoid replica-lag race on immediate re-add
      return write(
        `/* addListItem:existing */
        SELECT id, user_list_id AS list_id, ${entityColumn} AS entity_id, order_index, created_at
        FROM ${table}
        WHERE user_list_id = $1
          AND ${entityColumn} = $2
          AND removed_at IS NULL
        LIMIT 1
        `,
        [listId, entityId],
      )
    }
    if (code === '23503') {
      assert(false, 404, 'Referenced list or entity does not exist')
    }
    if (code === '22P02') {
      assert(false, 422, 'Invalid entity ID format')
    }
    throw err
  })

  assert(rows.length > 0, 500, 'Failed to add list item')

  let mediaType: string | null = null
  if (itemType === 'rss_feed_item') {
    const { rows: rfiRows } = await write(
      `/* addListItem:mediaType */
      SELECT media_type FROM rss_feed_items WHERE id = $1 LIMIT 1
      `,
      [entityId],
    )
    mediaType = (rfiRows[0]?.media_type as string | null) ?? null
  }

  const item = rowToListItem({ ...rows[0]!, media_type: mediaType }, itemType)
  await invalidate.lists(listId)
  return item
}

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
        rfi.media_type::text AS media_type
      FROM user_list_rss_feed_items li
      JOIN rss_feed_items rfi ON rfi.id = li.rss_feed_item_id AND rfi.deleted_at IS NULL
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
        NULL::text AS media_type
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
    SELECT id, list_id, item_type, entity_id, order_index, created_at, media_type
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
