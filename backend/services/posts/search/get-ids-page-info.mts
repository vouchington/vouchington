import createHttpError from 'http-errors'
import {
  decodeUuidCursor,
  encodeCursor,
  isRankingCursor,
  isScoreCursor,
  isSimpleCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PostSearchOptions } from './types.mts'
import type { PostSearchRow } from './get-ids.mts'

export type PostSearchCursorValues = {
  id_lt?: string
  vote_score_lt?: number
  ranking_lt?: number
  hot_score_lt?: number
}

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
  if (sort === 'following_new') {
    const cursor = decodeUuidCursor(
      options.after,
      isRankingCursor,
      'Invalid cursor for sort=following_new',
    )
    return { ranking_lt: cursor.ranking, id_lt: cursor.id }
  }
  if (sort === 'best') {
    const cursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor for sort=best')
    return { vote_score_lt: cursor.score, id_lt: cursor.id }
  }
  if (sort === 'hot') {
    const cursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor for sort=hot')
    return { hot_score_lt: cursor.score, id_lt: cursor.id }
  }
  if (sort === 'relevance') {
    if (hasRankingScore) {
      const cursor = decodeUuidCursor(
        options.after,
        isRankingCursor,
        'Invalid cursor for sort=relevance',
      )
      return { ranking_lt: cursor.ranking, id_lt: cursor.id }
    }
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
    })
  }
  if (sort === 'best') {
    return encodeCursor({ score: requiredNumber(row.vote_score, 'vote_score'), id: row.id })
  }
  if (sort === 'hot') {
    return encodeCursor({ score: requiredNumber(row.hot_score, 'hot_score'), id: row.id })
  }
  if (sort === 'relevance' && hasRankingScore) {
    return encodeCursor({
      ranking: requiredNumber(row.ranking_score, 'ranking_score'),
      id: row.id,
    })
  }
  return encodeCursor({ id: row.id })
}

function requiredNumber(value: unknown, column: string): number {
  const parsed = parseNumeric(value)
  if (parsed === null) throw createHttpError(500, `${column} missing from query result`)
  return parsed
}

function parseNumeric(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const parsed = Number.parseFloat(String(value))
  return Number.isNaN(parsed) ? null : parsed
}
