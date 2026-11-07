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
import { invalidate } from '@services/entity-cache/invalidate'
import { rowToListItem } from './item-row.mts'
import { postItemFactsSql } from './item-facts.mts'
import { listItemEligibleSql } from './list-item-eligible-sql.mts'
export { addListItem, addListItems } from './add-item.mts'

type ListItemPageRow = Record<string, unknown> & {
  eligible: boolean
  id: string
  item_type: ListItemType
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

  const rawLimit = limit + 1
  let afterId: string | undefined
  if (options.after) {
    afterId = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor format: expected id cursor',
    ).id
  }

  // Each branch's top rawLimit ids contain the global top rawLimit. The merged page is the
  // membership keyset; target, media, and read filters can leave it short.
  const query = sql`/* searchListItems */
    WITH post_page AS MATERIALIZED (
      SELECT li.id, 'post'::user_list_item_types AS item_type,
             li.post_id AS entity_id, li.order_index, li.created_at
      FROM user_list_posts li
      WHERE li.user_list_id = ${listId}::uuid
        AND li.removed_at IS NULL`
  if (afterId) query.append(sql` AND li.id < ${afterId}::uuid`)
  query.append(sql`
      ORDER BY li.id DESC
      LIMIT ${rawLimit}
    ),
    rss_page AS MATERIALIZED (
      SELECT li.id, 'rss_feed_item'::user_list_item_types AS item_type,
             li.rss_feed_item_id AS entity_id, li.order_index, li.created_at
      FROM user_list_rss_feed_items li
      WHERE li.user_list_id = ${listId}::uuid
        AND li.removed_at IS NULL`)
  if (afterId) query.append(sql` AND li.id < ${afterId}::uuid`)
  query.append(sql`
      ORDER BY li.id DESC
      LIMIT ${rawLimit}
    ),
    driving_page AS MATERIALIZED (
      SELECT id, item_type, entity_id, order_index, created_at
      FROM (
        SELECT id, item_type, entity_id, order_index, created_at FROM post_page
        UNION ALL
        SELECT id, item_type, entity_id, order_index, created_at FROM rss_page
      ) merged
      ORDER BY id DESC
      LIMIT ${rawLimit}
    )
    SELECT page.id,
           ${listId}::uuid AS list_id,
           page.item_type,
           page.entity_id,
           page.order_index,
           page.created_at,
           CASE
             WHEN page.item_type = 'rss_feed_item' THEN rfi.media_type::text
           END AS media_type,
           CASE
             WHEN page.item_type = 'post' THEN post_labels.entity_label
             ELSE COALESCE(NULLIF(BTRIM(rfi.data->>'title'), ''), article_url.url)
           END AS entity_label,
           CASE WHEN page.item_type = 'post' THEN post_labels.label_markdown END AS label_markdown,
           CASE WHEN page.item_type = 'post' THEN post_labels.label_summary END AS label_summary,
           COALESCE((`)
  query.append(listItemEligibleSql(options))
  query.append(sql`), FALSE) AS eligible
    FROM driving_page page
    LEFT JOIN LATERAL (
      SELECT id, root_post_id, post_type, deleted_at, approved_at, created_by_id, community_id,
             privacy, broadcast, archived_at, title, markdown, ai_summary_markdown
      FROM posts candidate_post
      WHERE page.item_type = 'post' AND candidate_post.id = page.entity_id
      LIMIT 1
    ) candidate_post ON TRUE
    LEFT JOIN LATERAL (
      SELECT id, post_type, deleted_at, approved_at, created_by_id, community_id,
             privacy, broadcast, archived_at
      FROM posts root_post
      WHERE root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      LIMIT 1
    ) root_post ON TRUE
    LEFT JOIN LATERAL (
      SELECT id, deleted_at, media_type, data, url_id
      FROM rss_feed_items rfi
      WHERE page.item_type = 'rss_feed_item' AND rfi.id = page.entity_id
      LIMIT 1
    ) rfi ON TRUE
    LEFT JOIN LATERAL (
      SELECT id, url
      FROM urls article_url
      WHERE article_url.id = rfi.url_id
      LIMIT 1
    ) article_url ON TRUE
    LEFT JOIN LATERAL (
      SELECT `)
  query.append(postItemFactsSql('candidate_post'))
  query.append(sql`
    ) post_labels ON TRUE
    ORDER BY page.id DESC`)

  const { rows } = await read<ListItemPageRow>(query)
  const { window, hasMore } = sliceRawKeysetPage(rows, limit)
  const results: ListItem[] = []
  for (const row of window) {
    if (row.eligible) results.push(rowToListItem(row, row.item_type))
  }

  return {
    results,
    page_info: buildPageInfo(window, {
      hasNextPage: hasMore,
      getCursor: row => ({ id: row.id }),
    }),
  }
}
