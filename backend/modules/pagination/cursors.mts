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
  decodeScopedUuidCursorWithLegacySimple,
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
