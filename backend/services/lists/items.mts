import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { getListItemStorageConfig } from './catalog.mts'
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
    INSERT INTO ${table} (list_id, ${entityColumn})
    VALUES ($1, $2)
    RETURNING id, list_id, ${entityColumn} AS entity_id, order_index, created_at
    `,
    [listId, entityId],
  ).catch(async (error: unknown) => {
    const code = (error as { code?: string }).code
    if (code === '23505') {
      // write() not read() to avoid replica-lag race on immediate re-add
      return write(
        `/* addListItem:existing */
        SELECT id, list_id, ${entityColumn} AS entity_id, order_index, created_at
        FROM ${table}
        WHERE list_id = $1
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
    throw error
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
    WHERE list_id = $1
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
  } = {},
): Promise<{ results: ListItem[]; page_info: PageInfo }> {
  const limit = options.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  const params: unknown[] = [listId]
  let sql = `/* searchListItems */
    SELECT id, list_id, item_type, entity_id, order_index, created_at, media_type
    FROM view_list_items
    WHERE list_id = $1
  `

  if (options.mediaType) {
    params.push(options.mediaType)
    sql += ` AND media_type = $${params.length}`
  }

  if (options.read !== undefined && options.currentUserId) {
    params.push(options.currentUserId)
    const paramIdx = params.length
    const readExistsClause = `(
      CASE
        WHEN item_type = 'rss_feed_item' THEN EXISTS (SELECT 1 FROM rss_feed_item_read_states WHERE user_id = $${paramIdx}::uuid AND rss_feed_item_id = entity_id::uuid)
        WHEN item_type = 'post' THEN EXISTS (SELECT 1 FROM post_read_states WHERE user_id = $${paramIdx}::uuid AND post_id = entity_id::uuid)
        ELSE NULL
      END
    )`
    sql += options.read ? ` AND ${readExistsClause}` : ` AND NOT ${readExistsClause}`
  }

  if (options.after) {
    const cursor = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor format: expected id cursor',
    )
    params.push(cursor.id)
    sql += ` AND id < $${params.length}::uuid`
  }

  sql += ` ORDER BY id DESC LIMIT $${params.length + 1}`
  params.push(limit + 1)

  const { rows } = await read(sql, params)
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
