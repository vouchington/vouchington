import { clampLimit } from '@services/pagination'
import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import {
  buildPageInfo,
  decodeUuidCursor,
  isSimpleCursor,
  sliceRawKeysetPage,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import { getListItemStorageConfig } from './catalog.mts'
import type { ListItem, ListItemType } from './types.mts'
import { rowToListItem } from './item-row.mts'
import { listPostDiscoveryFilter } from './listable.mts'
import { postItemFactsSql } from './item-facts.mts'
export { addListItem, addListItems } from './add-item.mts'

type ListItemPageRow = Record<string, unknown> & {
  id: string
  item_type: ListItemType
}

type ListItemReadOptions = {
  read?: boolean
  currentUserId?: string
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

  const rawLimit = limit + 1
  let afterId: string | undefined
  if (options.after) {
    afterId = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor format: expected id cursor',
    ).id
  }

  // Each arm is one index walk of eligible rows. The derived table merges those arms and
  // limits the page once.
  const query = sql`/* searchListItems */
    SELECT page.id, page.list_id, page.item_type, page.entity_id, page.order_index,
           page.created_at, page.media_type, page.entity_label, page.label_markdown,
           page.label_summary
    FROM (`
  if (!options.mediaType) {
    appendPostListArm(query, listId, afterId, rawLimit, options)
    query.append(sql` UNION ALL `)
  }
  appendRssListArm(query, listId, afterId, rawLimit, options)
  query.append(sql`) page
    ORDER BY page.id DESC
    LIMIT ${rawLimit}`)

  const { rows } = await read<ListItemPageRow>(query)
  const { window, hasMore } = sliceRawKeysetPage(rows, limit)
  const results = window.map(row => rowToListItem(row, row.item_type))

  return {
    results,
    page_info: buildPageInfo(window, {
      hasNextPage: hasMore,
      getCursor: row => ({ id: row.id }),
    }),
  }
}

function appendPostListArm(
  query: ReturnType<typeof sql>,
  listId: string,
  afterId: string | undefined,
  rawLimit: number,
  options: ListItemReadOptions & { isAdministrator?: boolean },
): void {
  query.append(sql`(
    SELECT li.id, ${listId}::uuid AS list_id, 'post'::user_list_item_types AS item_type,
           li.post_id AS entity_id, li.order_index, li.created_at, NULL::text AS media_type, `)
  query.append(postItemFactsSql('candidate_post'))
  query.append(sql`
    FROM user_list_posts li
    JOIN posts candidate_post ON candidate_post.id = li.post_id
    JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
    WHERE li.user_list_id = ${listId}::uuid
      AND li.removed_at IS NULL`)
  if (afterId) query.append(sql` AND li.id < ${afterId}::uuid`)
  query
    .append(sql` AND `)
    .append(listPostDiscoveryFilter(options.currentUserId, options.isAdministrator === true))
  appendReadPredicate(query, 'post', options)
  query.append(sql`
    ORDER BY li.id DESC
    LIMIT ${rawLimit}
  )`)
}

function appendRssListArm(
  query: ReturnType<typeof sql>,
  listId: string,
  afterId: string | undefined,
  rawLimit: number,
  options: ListItemReadOptions & { mediaType?: string },
): void {
  query.append(sql`(
    SELECT li.id, ${listId}::uuid AS list_id, 'rss_feed_item'::user_list_item_types AS item_type,
           li.rss_feed_item_id AS entity_id, li.order_index, li.created_at,
           rfi.media_type::text AS media_type,
           COALESCE(NULLIF(BTRIM(rfi.data->>'title'), ''), article_url.url) AS entity_label,
           NULL::text AS label_markdown, NULL::text AS label_summary
    FROM user_list_rss_feed_items li
    JOIN rss_feed_items rfi ON rfi.id = li.rss_feed_item_id AND rfi.deleted_at IS NULL
    JOIN urls article_url ON article_url.id = rfi.url_id
    WHERE li.user_list_id = ${listId}::uuid
      AND li.removed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM rss_feed_item_sources source
        JOIN rss_feeds feed ON feed.id = source.rss_feed_id
          AND feed.deleted_at IS NULL AND feed.is_enabled = true
        WHERE source.rss_feed_item_id = rfi.id
      )`)
  if (afterId) query.append(sql` AND li.id < ${afterId}::uuid`)
  if (options.mediaType) query.append(sql` AND rfi.media_type::text = ${options.mediaType}`)
  appendReadPredicate(query, 'rss_feed_item', options)
  query.append(sql`
    ORDER BY li.id DESC
    LIMIT ${rawLimit}
  )`)
}

function appendReadPredicate(
  query: ReturnType<typeof sql>,
  itemType: 'post' | 'rss_feed_item',
  options: ListItemReadOptions,
): void {
  if (options.read === undefined || !options.currentUserId) return
  const userId = options.currentUserId
  const predicate =
    itemType === 'post'
      ? sql`EXISTS (
          SELECT 1 FROM post_read_states
          WHERE user_id = ${userId}::uuid AND post_id = li.post_id)`
      : sql`EXISTS (
          SELECT 1 FROM rss_feed_item_read_states
          WHERE user_id = ${userId}::uuid AND rss_feed_item_id = li.rss_feed_item_id)`
  query.append(options.read ? sql` AND ` : sql` AND NOT `).append(predicate)
}
