import createHttpError from 'http-errors'
import {
  decodeUuidCursor,
  decodeScopedScoreCursor,
  encodeCursor,
  hasExactKeys,
  isScoreCursor,
  isSimpleCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PostSearchOptions } from './types.mts'
import type { PostSearchRow } from './get-ids-types.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { stableHotCursorScope } from './stable-hot-rank.mts'

export type PostSearchCursorValues = {
  id_lt?: string
  vote_score_lt?: number
  ranking_lt?: number
  hot_score_lt?: number
}

/** Following rank and text rank share a keyset shape, so each sort carries its own scope. */
export const postSearchRankingCursorScope = {
  following_new: 'post-following-new-1',
  relevance: 'post-relevance-1',
} as const

export function decodePostSearchCursor(
  options: PostSearchOptions,
  sort: string,
  hasRankingScore: boolean,
): PostSearchCursorValues {
  if (!options.after) return {}
  if (sort === 'new') {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor for sort=new')
    return { id_lt: cursor.id }
  }
  if (sort === 'following_new') return decodeRankingCursor(options.after, sort)
  if (sort === 'best') {
    const cursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor for sort=best')
    return { vote_score_lt: cursor.score, id_lt: cursor.id }
  }
  if (sort === 'hot' || sort === 'trending') {
    const cursor = decodeScopedScoreCursor(
      options.after,
      stableHotCursorScope(sort),
      `Invalid cursor for sort=${sort}`,
    )
    if (!Number.isFinite(cursor.score))
      throw createHttpError(400, `Invalid cursor for sort=${sort}`)
    return { hot_score_lt: cursor.score, id_lt: cursor.id }
  }
  if (sort === 'relevance') {
    if (hasRankingScore) return decodeRankingCursor(options.after, sort)
    const cursor = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor for sort=relevance',
    )
    return { id_lt: cursor.id }
  }
  return {}
}

export function buildPostSearchPageInfo(
  resultRows: PostSearchRow[],
  hasNextPage: boolean,
  sort: string,
  hasRankingScore: boolean,
): PageInfo {
  const firstRow = resultRows.at(0)
  const lastRow = resultRows.at(-1)
  if (!firstRow) return { has_next_page: hasNextPage, end_cursor: null, start_cursor: null }

  const startCursor = encodePostSearchCursor(firstRow, sort, hasRankingScore)
  const endCursor =
    hasNextPage && lastRow ? encodePostSearchCursor(lastRow, sort, hasRankingScore) : null
  return { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: startCursor }
}

function encodePostSearchCursor(
  row: PostSearchRow,
  sort: string,
  hasRankingScore: boolean,
): string {
  if (sort === 'new') return encodeCursor({ id: row.id })
  if (sort === 'following_new') {
    return encodeCursor({
      ranking: requiredNumber(row.following_rank, 'following_rank'),
      id: row.id,
      scope: postSearchRankingCursorScope.following_new,
    })
  }
  if (sort === 'best') {
    return encodeCursor({ score: requiredNumber(row.vote_score, 'vote_score'), id: row.id })
  }
  if (sort === 'hot' || sort === 'trending') {
    return encodeCursor({
      score: requiredNumber(row.hot_score, 'hot_score'),
      id: row.id,
      scope: stableHotCursorScope(sort),
    })
  }
  if (sort === 'relevance' && hasRankingScore) {
    return encodeCursor({
      ranking: requiredNumber(row.ranking_score, 'ranking_score'),
      id: row.id,
      scope: postSearchRankingCursorScope.relevance,
    })
  }
  return encodeCursor({ id: row.id })
}

function decodeRankingCursor(
  after: string,
  sort: keyof typeof postSearchRankingCursorScope,
): PostSearchCursorValues {
  const cursor = decodeUuidCursor(after, isScopedRankingCursor, `Invalid cursor for sort=${sort}`)
  if (cursor.scope !== postSearchRankingCursorScope[sort])
    throw createHttpError(400, `Invalid cursor for sort=${sort}`)
  return { ranking_lt: cursor.ranking, id_lt: cursor.id }
}

function isScopedRankingCursor(
  value: unknown,
): value is { ranking: number; id: string; scope: string } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !hasExactKeys(value, ['ranking', 'id', 'scope'])
  )
    return false
  const cursor = value as { ranking: unknown; id: unknown; scope: unknown }
  return (
    typeof cursor.ranking === 'number' &&
    Number.isFinite(cursor.ranking) &&
    typeof cursor.id === 'string' &&
    typeof cursor.scope === 'string'
  )
}

function requiredNumber(value: unknown, column: string): number {
  const parsed = parseNumeric(value)
  if (parsed === null) throw createHttpError(500, `${column} missing from query result`)
  return parsed
}

function parseNumeric(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const parsed = Number.parseFloat(stringFromUnknown(value))
  return Number.isNaN(parsed) ? null : parsed
}
