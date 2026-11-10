import createHttpError from 'http-errors'
import { decodeUuidCursor, hasExactKeys } from '@modules/pagination'
import { getTimeRangeLowerBoundDate } from '@modules/feed-query-builders/time-range'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import type { TimeRange } from '@voucha/types/feed'
import type { PostSearchOptions } from './types.mts'
import { cursorGuard, cursorValues } from './get-ids-cursor-row.mts'

type PostSearchCursorValues = {
  id_lt?: string
  vote_score_lt?: number
  ranking_lt?: number
  hot_score_lt?: number
  as_of_ms?: number
}

const KNOWN_SORTS = new Set(['new', 'following_new', 'best', 'hot', 'relevance'])

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

function readCursorScope(
  scope: string,
  sort: string,
  timeRange: TimeRange | undefined,
  message: string,
): number | undefined {
  const parsed = parseScope(scope, message)
  const keys = [
    'resource',
    'sort',
    'time_range',
    ...(timeRange !== undefined && timeRange !== 'all' ? ['as_of_ms'] : []),
  ]
  if (
    !hasExactKeys(parsed, keys) ||
    parsed.resource !== 'post-search' ||
    parsed.sort !== sort ||
    parsed.time_range !== (timeRange ?? null)
  ) {
    throw createHttpError(400, message)
  }
  if (timeRange === undefined || timeRange === 'all') return undefined
  const asOfMs = parsed.as_of_ms
  if (
    typeof asOfMs !== 'number' ||
    !Number.isSafeInteger(asOfMs) ||
    !Number.isFinite(new Date(asOfMs).getTime())
  ) {
    throw createHttpError(400, message)
  }
  assertUuidLowerBound(timeRange, asOfMs, message)
  return asOfMs
}

function assertUuidLowerBound(timeRange: TimeRange, asOfMs: number, message: string): void {
  const lowerBound = getTimeRangeLowerBoundDate(timeRange, new Date(asOfMs))
  if (lowerBound === null) throw createHttpError(400, message)
  try {
    timestampToUuidv7LowerBound(lowerBound.getTime())
  } catch (err) {
    throw createHttpError(400, message, { cause: err })
  }
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

function isObject(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}
