import type { QueryOptions } from '@data-stores/psql/types'
import {
  buildPageInfo,
  decodeScopedScoreCursor,
  decodeUuidCursor,
  isTimestampCursor,
} from '@modules/pagination'
import { RECENTLY_VIEWED_ZSET_LIMIT, searchRecentlyViewedPage } from '@services/recently-viewed'
import { filterRssFeedIdsByFeedType, getRssFeedsByIdBatch } from '@services/rss-feeds/get-batch'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import {
  compactResults,
  getRecentlyViewedRssFeedIds,
  getRssFeedRelationRows,
} from '@services/users/profile-collection-ids'
import {
  RSS_FEED_LIST_TABLES,
  type RssFeedListType,
} from '@services/users/profile-collection-tables'
import type { PageInfo } from '@voucha/types/pagination'

type RssFeedType = 'article' | 'podcast' | 'video' | 'mixed'

async function getUserViewedRssFeedsCollection(
  userId: string,
  pagination: { limit: number; after?: string; feedType?: RssFeedType },
  options: QueryOptions = {},
): Promise<{ results: ViewRssFeed[]; page_info: PageInfo }> {
  const { limit, after, feedType } = pagination

  if (!feedType) {
    const ids = await getRecentlyViewedRssFeedIds(userId, limit)
    const rssFeeds = await getRssFeedsByIdBatch(ids, options)
    const feedsMap = new Map(
      rssFeeds.filter((feed): feed is ViewRssFeed => feed != null).map(feed => [feed.id, feed]),
    )
    const results = ids
      .map(id => feedsMap.get(id))
      .filter((feed): feed is ViewRssFeed => feed !== undefined)
    const page_info: PageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
    return { results, page_info }
  }

  // Valkey recently-viewed ZSETs have no feed_type dimension. Read the remaining
  // window (the ZSET itself is capped at RECENTLY_VIEWED_ZSET_LIMIT), filter in
  // Postgres, then paginate matches so leftover same-type feeds are reachable.
  // Cursors come from the last returned match, not the raw window.
  const scope = `user:${userId}:rss-feeds:viewed:${feedType}`
  const afterCursor = after
    ? decodeScopedScoreCursor(after, scope, 'Invalid viewed-rss-feed cursor')
    : undefined
  const rows = await searchRecentlyViewedPage(
    'rss_feed',
    userId,
    RECENTLY_VIEWED_ZSET_LIMIT,
    afterCursor,
  )
  const matchingIds = await filterRssFeedIdsByFeedType(
    rows.map(row => row.id),
    feedType,
    options,
  )
  const matchingRows = rows.filter(row => matchingIds.has(row.id))
  const hasNextPage = matchingRows.length > limit
  const pageRows = matchingRows.slice(0, limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ score: row.score, id: row.id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }
  return {
    results: compactResults(
      await getRssFeedsByIdBatch(
        pageRows.map(row => row.id),
        options,
      ),
    ),
    page_info,
  }
}

export async function getUserRssFeedsCollection(
  userId: string,
  listType: RssFeedListType = 'following',
  paginationOptions: {
    limit?: number
    after?: string
    feedType?: RssFeedType
  } = {},
  options: QueryOptions = {},
): Promise<{ results: ViewRssFeed[]; page_info: PageInfo }> {
  const { limit = 25, after, feedType } = paginationOptions

  if (listType === 'viewed') {
    return getUserViewedRssFeedsCollection(userId, { limit, after, feedType }, options)
  }

  let afterCursor: { timestamp: number; id: string } | undefined
  if (after) {
    const decoded = decodeUuidCursor(
      after,
      isTimestampCursor,
      'Invalid cursor format: expected timestamp cursor',
    )
    afterCursor = decoded
  }

  const relRows = await getRssFeedRelationRows(
    RSS_FEED_LIST_TABLES[listType],
    userId,
    limit + 1,
    options,
    { feedType, after: afterCursor },
  )

  const hasNextPage = relRows.length > limit
  const pageRows = relRows.slice(0, limit)

  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: r => ({ timestamp: r.created_us, id: r.object_id }),
  })

  if (pageRows.length === 0) {
    return { results: [], page_info }
  }

  const rssFeeds = await getRssFeedsByIdBatch(
    pageRows.map(r => r.object_id),
    options,
  )
  return { results: compactResults(rssFeeds), page_info }
}
