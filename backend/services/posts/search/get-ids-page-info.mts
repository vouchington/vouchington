import type { PageInfo } from '@voucha/types/pagination'
import type { TimeRange } from '@voucha/types/feed'
import type { PostSearchRow } from './get-ids-types.mts'
import { decodePostSearchCursor, postSearchCursorScope } from './get-ids-cursor.mts'
import { encodePostSearchCursor } from './get-ids-cursor-row.mts'

export type { PostSearchCursorValues } from './get-ids-cursor.mts'
export { decodePostSearchCursor, postSearchCursorScope }

type CursorScope = { timeRange?: TimeRange; asOfMs?: number }

export function buildPostSearchPageInfo(
  resultRows: PostSearchRow[],
  hasNextPage: boolean,
  sort: string,
  hasRankingScore: boolean,
  cursorScope: CursorScope,
): PageInfo {
  const firstRow = resultRows.at(0)
  const lastRow = resultRows.at(-1)
  if (!firstRow) return { has_next_page: hasNextPage, end_cursor: null, start_cursor: null }
  const scope = postSearchCursorScope(sort, cursorScope.timeRange, cursorScope.asOfMs)
  const encode = (row: PostSearchRow) => encodePostSearchCursor(row, sort, hasRankingScore, scope)
  return {
    has_next_page: hasNextPage,
    start_cursor: encode(firstRow),
    end_cursor: hasNextPage && lastRow ? encode(lastRow) : null,
  }
}
