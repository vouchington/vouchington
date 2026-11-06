import { buildPageInfo as buildPlatformPageInfo } from '@vouchington/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { Cursor } from './types.mts'

export {
  decodeCursor,
  decodeScopedAliasCursor,
  decodeScopedScoreCursor,
  decodeScopedTierCursor,
  decodeScopedTimestampUuidCursor,
  decodeScopedUuidCursor,
  decodeUuidCursor,
  encodeCursor,
  encodeScopedAliasCursor,
  encodeScopedUuidCursor,
  hasExactKeys,
  isNameCursor,
  isPreciseTimestampCursor,
  isPreciseTimestampString,
  isRankingCursor,
  isScoreCursor,
  isSimpleCursor,
  isTierCursor,
  isTimestampCursor,
} from '@vouchington/pagination'

/**
 * Newer `created_us` first, then higher lowercase UUID text. That text order matches
 * Postgres `uuid` order. Callers sort before slicing: a join does not keep the driving
 * page's order, and the page is at most `limit + 1` rows.
 */
export function sortMembershipKeysetRows<T extends { created_us: number; entity_id: string }>(
  rows: readonly T[],
): T[] {
  return rows.toSorted((left, right) => {
    if (left.created_us !== right.created_us) return left.created_us > right.created_us ? -1 : 1
    if (left.entity_id === right.entity_id) return 0
    return left.entity_id > right.entity_id ? -1 : 1
  })
}

/** The extra row is only the has-more probe. The cursor is the last key of the consumed window. */
export function sliceRawKeysetPage<T>(
  rows: readonly T[],
  limit: number,
): { window: T[]; hasMore: boolean } {
  return { window: rows.slice(0, limit), hasMore: rows.length > limit }
}

export function buildPageInfo<T>(
  items: readonly T[],
  options: {
    hasNextPage: boolean
    getCursor: (item: T) => Cursor
  },
): PageInfo {
  const pageInfo = buildPlatformPageInfo(items, options)
  return {
    has_next_page: pageInfo.hasNextPage,
    start_cursor: pageInfo.startCursor,
    end_cursor: pageInfo.endCursor,
  }
}
