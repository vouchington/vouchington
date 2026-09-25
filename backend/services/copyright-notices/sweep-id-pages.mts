import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'

/** One UUID-keyset page of the immutable IDs a copyright reconcile sweep acts on. */
export type CopyrightSweepIdPage = {
  results: string[]
  page_info: PageInfo
}

export type CopyrightSweepPageOptions = { after?: string; limit?: number }

/** Validates a sweep page request. Callers fetch `limit + 1` rows after `afterId`. */
export function parseCopyrightSweepPageOptions(
  options: CopyrightSweepPageOptions,
  cursorMessage: string,
): { limit: number; afterId: string | null } {
  const limit = options.limit ?? 100
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= 100,
    422,
    'limit must be between 1 and 100',
  )
  const afterId = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, cursorMessage).id
    : null
  return { limit, afterId }
}

export function toCopyrightSweepIdPage(
  rows: ReadonlyArray<{ id: string }>,
  limit: number,
): CopyrightSweepIdPage {
  const page = rows.slice(0, limit)
  return {
    results: page.map(row => row.id),
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id }),
    }),
  }
}
