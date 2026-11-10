import createHttpError from 'http-errors'
import { encodeCursor, hasExactKeys } from '@modules/pagination'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import type { PostSearchRow } from './get-ids-types.mts'

export type CursorRow = { id: string; scope: string; score?: number; ranking?: number }

export function encodePostSearchCursor(
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

export function cursorValues(
  sort: string,
  hasRankingScore: boolean,
  row: CursorRow,
): { id_lt: string; ranking_lt?: number; vote_score_lt?: number; hot_score_lt?: number } {
  if (sort === 'following_new' || (sort === 'relevance' && hasRankingScore)) {
    return { ranking_lt: finiteField(row, 'ranking'), id_lt: row.id }
  }
  if (sort === 'best') return { vote_score_lt: finiteField(row, 'score'), id_lt: row.id }
  if (sort === 'hot') return { hot_score_lt: finiteField(row, 'score'), id_lt: row.id }
  return { id_lt: row.id }
}

export function cursorGuard(
  sort: string,
  hasRankingScore: boolean,
): (row: unknown) => row is CursorRow {
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

function finiteField(row: CursorRow, field: 'ranking' | 'score'): number {
  const value = row[field]
  if (typeof value !== 'number') throw createHttpError(500, `${field} missing from cursor`)
  return value
}

function requiredNumber(value: unknown, column: string): number {
  if (value === undefined || value === null) {
    throw createHttpError(500, `${column} missing from query result`)
  }
  const parsed = Number.parseFloat(stringFromUnknown(value))
  if (Number.isNaN(parsed)) throw createHttpError(500, `${column} missing from query result`)
  return parsed
}

function isObject(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}
