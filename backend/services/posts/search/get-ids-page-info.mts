import createHttpError from 'http-errors'
import { decodeUuidCursor, encodeCursor, hasExactKeys } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { TimeRange } from '@voucha/types/feed'
import type { PostSearchOptions } from './types.mts'
import type { PostSearchRow } from './get-ids-types.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export type PostSearchCursorValues = {
  id_lt?: string
  vote_score_lt?: number
  ranking_lt?: number
  hot_score_lt?: number
  as_of_ms?: number
}

const KNOWN_SORTS = new Set(['new', 'following_new', 'best', 'hot', 'relevance'])

type CursorScope = { timeRange?: TimeRange; asOfMs?: number }
type CursorRow = { id: string; scope: string; score?: number; ranking?: number }

/** Opaque scope that binds a post-search cursor to its sort and time-range choice. */
export function postSearchCursorScope(
  sort: string,
  timeRange?: TimeRange,
  asOfMs?: number,
): string {
  const finite = timeRange !== undefined && timeRange !== 'all'
  const body: Record<string, unknown> = {
    resource: 'post-search',
    sort,
    time_range: timeRange ?? null,
  }
  if (finite && asOfMs !== undefined) body.as_of_ms = asOfMs
  return JSON.stringify(body)
}

export function decodePostSearchCursor(
  options: PostSearchOptions,
  sort: string,
  hasRankingScore: boolean,
): PostSearchCursorValues {
  if (!options.after || !KNOWN_SORTS.has(sort)) return {}
  const message = `Invalid cursor for sort=${sort}`
  const row = decodeUuidCursor(options.after, cursorGuard(sort, hasRankingScore), message)
  const asOfMs = readCursorScope(row.scope, sort, options.time_range, message)
  const values = cursorValues(sort, hasRankingScore, row)
  return asOfMs === undefined ? values : { ...values, as_of_ms: asOfMs }
}

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

function cursorValues(
  sort: string,
  hasRankingScore: boolean,
  row: CursorRow,
): PostSearchCursorValues {
  if (sort === 'following_new' || (sort === 'relevance' && hasRankingScore)) {
    return { ranking_lt: finiteField(row, 'ranking'), id_lt: row.id }
  }
  if (sort === 'best') return { vote_score_lt: finiteField(row, 'score'), id_lt: row.id }
  if (sort === 'hot') return { hot_score_lt: finiteField(row, 'score'), id_lt: row.id }
  return { id_lt: row.id }
}

function encodePostSearchCursor(
  row: PostSearchRow,
  sort: string,
  hasRankingScore: boolean,
  scope: string,
): string {
  if (sort === 'following_new') {
    return encodeCursor({
      ranking: requiredNumber(row.following_rank, 'following_rank'),
      id: row.id,
      scope,
    })
  }
  if (sort === 'best') {
    return encodeCursor({ score: requiredNumber(row.vote_score, 'vote_score'), id: row.id, scope })
  }
  if (sort === 'hot') {
    return encodeCursor({ score: requiredNumber(row.hot_score, 'hot_score'), id: row.id, scope })
  }
  if (sort === 'relevance' && hasRankingScore) {
    return encodeCursor({
      ranking: requiredNumber(row.ranking_score, 'ranking_score'),
      id: row.id,
      scope,
    })
  }
  return encodeCursor({ id: row.id, scope })
}

function cursorGuard(sort: string, hasRankingScore: boolean): (row: unknown) => row is CursorRow {
  const numberField =
    sort === 'following_new' || (sort === 'relevance' && hasRankingScore)
      ? 'ranking'
      : sort === 'best' || sort === 'hot'
        ? 'score'
        : null
  return row => isCursorRow(row, numberField)
}

function isCursorRow(row: unknown, numberField: 'ranking' | 'score' | null): row is CursorRow {
  if (!isObject(row) || typeof row.scope !== 'string') return false
  const keys = numberField === null ? ['id', 'scope'] : ['id', numberField, 'scope']
  return (
    hasExactKeys(row, keys) &&
    (numberField === null ||
      (typeof row[numberField] === 'number' && Number.isFinite(row[numberField])))
  )
}

function readCursorScope(
  scope: string,
  sort: string,
  timeRange: TimeRange | undefined,
  message: string,
): number | undefined {
  const parsed = parseScope(scope, message)
  const finite = timeRange !== undefined && timeRange !== 'all'
  const keys = ['resource', 'sort', 'time_range', ...(finite ? ['as_of_ms'] : [])]
  if (
    !hasExactKeys(parsed, keys) ||
    parsed.resource !== 'post-search' ||
    parsed.sort !== sort ||
    parsed.time_range !== (timeRange ?? null)
  ) {
    throw createHttpError(400, message)
  }
  if (!finite) return undefined
  const asOfMs = parsed.as_of_ms
  if (
    typeof asOfMs !== 'number' ||
    !Number.isSafeInteger(asOfMs) ||
    !Number.isFinite(new Date(asOfMs).getTime())
  ) {
    throw createHttpError(400, message)
  }
  return asOfMs
}

function parseScope(scope: string, message: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(scope)
  } catch (err) {
    throw createHttpError(400, message, { cause: err })
  }
  if (!isObject(parsed)) throw createHttpError(400, message)
  return parsed
}

function finiteField(row: CursorRow, field: 'ranking' | 'score'): number {
  const value = row[field]
  if (typeof value !== 'number') throw createHttpError(500, `${field} missing from cursor`)
  return value
}

function isObject(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

function requiredNumber(value: unknown, column: string): number {
  if (value === undefined || value === null) {
    throw createHttpError(500, `${column} missing from query result`)
  }
  const parsed = Number.parseFloat(stringFromUnknown(value))
  if (Number.isNaN(parsed)) throw createHttpError(500, `${column} missing from query result`)
  return parsed
}
