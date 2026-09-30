import { decodeUuidCursor, encodeCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'

export function resolveCommunityIdCursorPage(options?: { limit?: number; after?: string }): {
  limit: number
  cursorId: string | undefined
} {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  return { limit, cursorId }
}

export function buildCommunityIdCursorPage<T extends { id: string }>(
  rows: readonly T[],
  limit: number,
): { results: T[]; page_info: PageInfo } {
  const hasNextPage = rows.length > limit
  const results: T[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]!)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              name: results[results.length - 1]!.id,
              id: results[results.length - 1]!.id,
            })
          : null,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0]!.id, id: results[0]!.id }) : null,
    },
  }
}
