import type { QueryOptions } from '@data-stores/psql/types'
import {
  buildPageInfo,
  decodeScopedScoreCursor,
  decodeScopedTimestampUuidCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { RECENTLY_VIEWED_ZSET_LIMIT, searchRecentlyViewedPage } from '@services/recently-viewed'
import {
  filterRssFeedItemIdsByMediaType,
  getRssFeedItemsByIdBatch,
} from '@services/rss-feed-items/get-batch'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import {
  RSS_FEED_ITEM_LIST_TABLES,
  type RssFeedItemListType,
} from '@services/users/profile-collection-tables'
import { compactResults, getRssFeedItemRelationRows } from '@services/users/profile-collection-ids'

const DEFAULT_LIMIT = 100

async function getUserRssFeedItemRelationCollection(
  userId: string,
  listType: Exclude<RssFeedItemListType, 'viewed'>,
  pagination: { limit: number; after?: string },
  filterOptions: { mediaType?: 'article' | 'audio' | 'video' },
  options: QueryOptions = {},
): Promise<{ results: ViewRssFeedItem[]; page_info: PageInfo }> {
  const scope = `user:${userId}:rss-feed-items:${listType}`
  const afterCursor = pagination.after
    ? decodeScopedTimestampUuidCursor(
        pagination.after,
        scope,
        `Invalid ${listType}-rss-feed-item cursor`,
      )
    : undefined
  // The saved/hidden tables filter media_type in SQL (via the rss_feed_items join), so
  // has_next_page below is exact for the filtered set.
  const relationRows = await getRssFeedItemRelationRows(
    RSS_FEED_ITEM_LIST_TABLES[listType],
    userId,
    pagination.limit + 1,
    options,
    { mediaType: filterOptions.mediaType, after: afterCursor },
  )
  const hasNextPage = relationRows.length > pagination.limit
  const pageRows = relationRows.slice(0, pagination.limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }

  const items = await getRssFeedItemsByIdBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  return { results: compactResults(items), page_info }
}

async function getUserViewedRssFeedItemsCollection(
  userId: string,
  pagination: { limit: number; after?: string },
  filterOptions: { mediaType?: 'article' | 'audio' | 'video' },
  options: QueryOptions = {},
): Promise<{ results: ViewRssFeedItem[]; page_info: PageInfo }> {
  const mediaType = filterOptions.mediaType
  const scope = mediaType
    ? `user:${userId}:rss-feed-items:viewed:${mediaType}`
    : `user:${userId}:rss-feed-items:viewed`
  const after = pagination.after
    ? decodeScopedScoreCursor(pagination.after, scope, 'Invalid viewed-rss-feed-item cursor')
    : undefined

  if (!mediaType) {
    const rows = await searchRecentlyViewedPage(
      'rss_feed_item',
      userId,
      pagination.limit + 1,
      after,
    )
    const pageRows = rows.slice(0, pagination.limit)
    const page_info = buildPageInfo(pageRows, {
      hasNextPage: rows.length > pagination.limit,
      getCursor: row => ({ score: row.score, id: row.id, scope }),
    })
    if (pageRows.length === 0) return { results: [], page_info }
    return {
      results: compactResults(
        await getRssFeedItemsByIdBatch(
          pageRows.map(row => row.id),
          options,
        ),
      ),
      page_info,
    }
  }

  // Valkey recently-viewed ZSETs have no media_type dimension. Read the remaining
  // window (the ZSET itself is capped at RECENTLY_VIEWED_ZSET_LIMIT), filter in
  // Postgres, then paginate matches so page 1 is dense. Cursors come from the
  // last returned match, not the raw window.
  const rows = await searchRecentlyViewedPage(
    'rss_feed_item',
    userId,
    RECENTLY_VIEWED_ZSET_LIMIT,
    after,
  )
  const matchingIds = await filterRssFeedItemIdsByMediaType(
    rows.map(row => row.id),
    mediaType,
    options,
  )
  const matchingRows = rows.filter(row => matchingIds.has(row.id))
  const hasNextPage = matchingRows.length > pagination.limit
  const pageRows = matchingRows.slice(0, pagination.limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ score: row.score, id: row.id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }
  return {
    results: compactResults(
      await getRssFeedItemsByIdBatch(
        pageRows.map(row => row.id),
        options,
      ),
    ),
    page_info,
  }
}

export async function getUserRssFeedItemsCollection(
  userId: string,
  listType: RssFeedItemListType,
  paginationOptions: {
    limit?: number
    after?: string
    mediaType?: 'article' | 'audio' | 'video'
  } = {},
  options: QueryOptions = {},
): Promise<{ results: ViewRssFeedItem[]; page_info: PageInfo }> {
  const { limit = DEFAULT_LIMIT, after, mediaType } = paginationOptions
  const pagination = { limit, after }
  if (listType === 'viewed') {
    return getUserViewedRssFeedItemsCollection(userId, pagination, { mediaType }, options)
  }
  return getUserRssFeedItemRelationCollection(userId, listType, pagination, { mediaType }, options)
}
