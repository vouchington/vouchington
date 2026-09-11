import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, buildPageInfo, isRankingCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import { communityListItemStorageCatalog, getCommunityListItemStorageConfig } from './catalog.mts'
import type { CommunityListItem, CommunityListItemType } from './types.mts'
import type { BasicUser } from '@services/users/types'
import sql from 'sql-template-strings'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'

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
      list_item.id,
      list_item.community_id,
      `
  query.append(`list_item.${entityColumn}`).append(sql` AS entity_id,
      list_item.order_index,
      list_item.added_by_id,
      list_item.created_at
    FROM `)
  query.append(table).append(sql` list_item`)
  if (itemType === 'post') {
    query.append(sql`
      JOIN posts candidate_post ON candidate_post.id = list_item.post_id
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)`)
  }
  query.append(sql`
    WHERE list_item.community_id = ${communityId}
      AND list_item.removed_at IS NULL`)
  if (itemType === 'post') {
    const eligibility = options?.currentUser
      ? buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
          currentUserId: options.currentUser.id,
          includeArchivedCommunities: true,
          isAdministrator: options.currentUser.roles.includes('administrator'),
        })
      : buildPublicPostEligibilityFilter('candidate_post', 'root_post', {
          includeArchivedCommunities: true,
        })
    query.append(sql` AND `).append(eligibility)
  }

  if (cursorOrderIndex !== undefined && cursorId !== undefined) {
    query.append(
      sql` AND (list_item.order_index, list_item.id) > (${cursorOrderIndex}, ${cursorId})`,
    )
  }

  query.append(sql`
    ORDER BY list_item.order_index ASC, list_item.id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityListItem[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push({
      __entity_type: 'community_list_item',
      id: rows[i]!.id as string,
      community_id: rows[i]!.community_id as string,
      item_type: itemType,
      entity_id: rows[i]!.entity_id as string,
      order_index: rows[i]!.order_index as number,
      added_by_id: (rows[i]!.added_by_id as string | null) ?? null,
      created_at: rows[i]!.created_at as Date,
    })
  }

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: item => ({ ranking: item.order_index, id: item.id }),
    }),
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
    if (itemType === 'post') {
      const eligibility = options?.currentUser
        ? buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
            currentUserId: options.currentUser.id,
            includeArchivedCommunities: true,
            isAdministrator: options.currentUser.roles.includes('administrator'),
          })
        : buildPublicPostEligibilityFilter('candidate_post', 'root_post', {
            includeArchivedCommunities: true,
          })
      query
        .append(sql` list_item
          JOIN posts candidate_post ON candidate_post.id = `)
        .append(`list_item.${entityColumn}`)
        .append(sql`
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
          WHERE list_item.community_id = ${communityId}
            AND list_item.removed_at IS NULL
            AND `)
        .append(eligibility)
    } else {
      query.append(sql` list_item
        WHERE list_item.community_id = ${communityId}
          AND list_item.removed_at IS NULL`)
    }
    query.append(`) AS ${itemType}`)
  }

  const { rows } = await read(query, options)

  const row = rows[0]!
  return Object.fromEntries(
    itemTypes.map(itemType => [itemType, row[itemType] as number]),
  ) as CommunityListItemCounts
}
