import { buildPageInfo, decodeUuidCursor, isScoreCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { RssFeedSearchRow, SearchRssFeedsOptions, ViewRssFeed } from './types.mts'

type CursorOptions = Pick<SearchRssFeedsOptions, 'cursorId' | 'cursorScore'>

/** Decodes `after` into the keyset of the sort: a score and id for trending, else an id. */
export function decodeRssFeedsCursor(
  after: string | undefined,
  sort: SearchRssFeedsOptions['sort'],
): CursorOptions {
  if (!after) return {}
  if (sort === 'trending') {
    const { score, id } = decodeUuidCursor(after, isScoreCursor, 'Invalid cursor')
    return { cursorScore: score, cursorId: id }
  }
  return { cursorId: decodeUuidCursor(after, isSimpleCursor, 'Invalid cursor').id }
}

/**
 * Cuts the over-fetched search rows to one page of feeds and builds its page info. The trending
 * score only seeds the cursor and never reaches the feed rows.
 */
export function buildRssFeedsPage(
  rows: RssFeedSearchRow[],
  options: { limit: number; sort: SearchRssFeedsOptions['sort']; hasTextSearch: boolean },
): { feeds: ViewRssFeed[]; page_info: PageInfo } {
  const page = rows.slice(0, options.limit)
  const feeds = page.map(({ cursor_score: _cursorScore, ...feed }): ViewRssFeed => feed)
  return {
    feeds,
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > options.limit && !options.hasTextSearch,
      // A trending search always selects the score its cursor needs.
      getCursor: row =>
        options.sort === 'trending'
          ? { score: row.cursor_score as number, id: row.id }
          : { id: row.id },
    }),
  }
}
