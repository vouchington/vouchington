import createHttpError from 'http-errors'
import {
  decodeUuidCursor,
  encodeCursor,
  isRankingCursor,
  isScoreCursor,
  isSimpleCursor,
  isTierCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { TopicSearchOptions } from './types.mts'
import type { TopicSearchState } from './query-builder-state.mts'
import type { TopicSearchRow } from './get-ids.mts'

export type TopicSearchCursorValues = {
  id_lt?: string
  tier_after?: number
  ranking_lt?: number
  score_lt?: number
}

export function decodeTopicSearchCursor(
  options: TopicSearchOptions,
  sort: string,
  state: TopicSearchState,
): TopicSearchCursorValues {
  if (!options.after) return {}
  if (sort === 'relevance' && state.hasTextSearch) {
    const cursor = decodeUuidCursor(
      options.after,
      isTierCursor,
      'Invalid cursor for sort=relevance with text search (expected tier+id)',
    )
    return { tier_after: cursor.tier, id_lt: cursor.id }
  }
  if (sort === 'relevance' && state.useSemanticRelevanceRanking) {
    const cursor = decodeUuidCursor(
      options.after,
      isRankingCursor,
      'Invalid cursor for sort=relevance with semantic/similarity search',
    )
    return { ranking_lt: cursor.ranking, id_lt: cursor.id }
  }
  if (sort === 'best') {
    const cursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor for sort=best')
    return { score_lt: cursor.score, id_lt: cursor.id }
  }
  if (sort === 'relevance') {
    const cursor = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor for sort=relevance (expected id)',
    )
    return { id_lt: cursor.id }
  }
  const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor for topic search')
  return { id_lt: cursor.id }
}

export function buildTopicSearchPageInfo(
  resultRows: TopicSearchRow[],
  hasNextPage: boolean,
  sort: string,
  state: TopicSearchState,
): PageInfo {
  const firstRow = resultRows.at(0)
  const lastRow = resultRows.at(-1)
  if (!firstRow) return { has_next_page: hasNextPage, end_cursor: null, start_cursor: null }

  const startCursor = encodeTopicSearchCursor(firstRow, sort, state)
  const endCursor = hasNextPage && lastRow ? encodeTopicSearchCursor(lastRow, sort, state) : null
  return { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: startCursor }
}

function encodeTopicSearchCursor(row: TopicSearchRow, sort: string, state: TopicSearchState) {
  if (sort === 'relevance' && state.hasTextSearch) {
    if (row.relevance_tier == null)
      throw createHttpError(500, 'relevance_tier missing from query result')
    return encodeCursor({ tier: row.relevance_tier, id: row.id })
  }
  if (sort === 'relevance' && state.useSemanticRelevanceRanking) {
    return encodeCursor({
      ranking: requiredNumber(row.ranking_score, 'ranking_score'),
      id: row.id,
    })
  }
  if (sort === 'best') {
    return encodeCursor({ score: requiredNumber(row.sort_score, 'sort_score'), id: row.id })
  }
  return encodeCursor({ id: row.id })
}

function requiredNumber(value: unknown, column: string): number {
  const parsed = parseNumeric(value)
  if (parsed == null) throw createHttpError(500, `${column} missing from query result`)
  return parsed
}

function parseNumeric(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const parsed = Number.parseFloat(String(value))
  return Number.isNaN(parsed) ? null : parsed
}
