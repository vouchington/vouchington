import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  decodeUuidCursor,
  buildPageInfo,
  isRankingCursor,
  sliceRawKeysetPage,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import { communityListItemStorageCatalog, getCommunityListItemStorageConfig } from './catalog.mts'
import type { CommunityListItem, CommunityListItemType } from './types.mts'
import type { BasicUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { listItemCountBody, listItemJoins, listItemPageEligible } from './item-type-sql.mts'

type CommunityListItemPageRow = {
  id: string
  community_id: string
  entity_id: string
  order_index: number
  added_by_id: string | null
  created_at: Date
}

export async function searchCommunityListItems(
  communityId: string,
  itemType: CommunityListItemType,
  options?: QueryOptions & {
    limit?: number
    after?: string
    currentUser?: BasicUser | null
  },
): Promise<{ results: CommunityListItem[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorOrderIndex: number | undefined
  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isRankingCursor, 'Invalid cursor format')
    cursorOrderIndex = cursor.ranking
    cursorId = cursor.id
  }

  const { table, entityColumn } = getCommunityListItemStorageConfig(itemType)

  const query = sql`/* searchCommunityListItems */
    SELECT
      page.id,
      page.community_id,
      `
  query.append(`page.${entityColumn}`).append(sql` AS entity_id,
      page.order_index,
      page.added_by_id,
      page.created_at
    FROM `)
  query.append(table).append(sql` page`)
  query.append(listItemJoins(itemType))
  query.append(sql`
    WHERE page.community_id = ${communityId}
      AND page.removed_at IS NULL`)
  if (cursorOrderIndex !== undefined && cursorId !== undefined) {
    query.append(sql` AND (page.order_index, page.id) > (${cursorOrderIndex}, ${cursorId})`)
  }
  query.append(sql` AND `).append(listItemPageEligible(itemType, options?.currentUser))
  query.append(sql`
    ORDER BY page.order_index ASC, page.id ASC
    LIMIT ${limit + 1}`)

  const { rows } = await read<CommunityListItemPageRow>(query, options)
  const { window, hasMore } = sliceRawKeysetPage(rows, limit)
  const results: CommunityListItem[] = window.map(row => ({
    __entity_type: 'community_list_item' as const,
    id: row.id,
    community_id: row.community_id,
    item_type: itemType,
    entity_id: row.entity_id,
    order_index: row.order_index,
    added_by_id: row.added_by_id,
    created_at: row.created_at,
  }))

  return {
    results,
    page_info: buildPageInfo(
      window.map(row => ({
        order_index: row.order_index,
        id: row.id,
      })),
      {
        hasNextPage: hasMore,
        getCursor: item => ({ ranking: item.order_index, id: item.id }),
      },
    ),
  }
}

export type CommunityListItemCounts = {
  topic: number
  rss_feed: number
  post: number
  url_hostname: number
  url: number
}

export async function getCommunityListItemCounts(
  communityId: string,
  options?: QueryOptions & { currentUser?: BasicUser | null },
): Promise<CommunityListItemCounts> {
  const itemTypes = Object.keys(communityListItemStorageCatalog) as CommunityListItemType[]
  const query = sql`/* getCommunityListItemCounts */ SELECT `
  for (const [index, itemType] of itemTypes.entries()) {
    if (index > 0) query.append(sql`, `)
    const { table, entityColumn } = communityListItemStorageCatalog[itemType]
    query.append(sql`(SELECT COUNT(*)::int FROM `).append(table)
    query.append(listItemCountBody(itemType, communityId, entityColumn, options?.currentUser))
    query.append(`) AS ${itemType}`)
  }

  const { rows } = await read(query, options)

  const row = rows[0]!
  return Object.fromEntries(
    itemTypes.map(itemType => [itemType, row[itemType] as number]),
  ) as CommunityListItemCounts
}
