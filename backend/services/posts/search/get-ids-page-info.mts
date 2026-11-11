import type { PageInfo } from '@voucha/types/pagination'
import type { TimeRange } from '@voucha/types/feed'
import type { PostSearchRow } from './get-ids-types.mts'
import { decodePostSearchCursor, postSearchCursorScope } from './get-ids-cursor.mts'
import { encodePostSearchCursor } from './get-ids-cursor-row.mts'

export { decodePostSearchCursor }

type CursorScope = { timeRange?: TimeRange; asOfMs?: number }

export function buildPostSearchPageInfo(
  resultRows: PostSearchRow[],
  hasNextPage: boolean,
  sort: string,
  hasRankingScore: boolean,
  cursorScope: CursorScope,
  inspectedTail?: PostSearchRow,
): PageInfo {
  const firstRow = resultRows.at(0)
  const lastRow = resultRows.at(-1)
  const scope = postSearchCursorScope(sort, cursorScope.timeRange, cursorScope.asOfMs)
  const encode = (row: PostSearchRow) => encodePostSearchCursor(row, sort, hasRankingScore, scope)
  // The cursor sits on the last inspected row, so a short or empty page can still continue.
  if (inspectedTail) {
    return {
      has_next_page: true,
      start_cursor: firstRow ? encode(firstRow) : null,
      end_cursor: encode(inspectedTail),
    }
  }
  if (!firstRow) return { has_next_page: hasNextPage, end_cursor: null, start_cursor: null }
  return {
    has_next_page: hasNextPage,
    start_cursor: encode(firstRow),
    end_cursor: hasNextPage && lastRow ? encode(lastRow) : null,
  }
}
