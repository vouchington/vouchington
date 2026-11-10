import createHttpError from 'http-errors'
import { decodeCursor, encodeCursor } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { postsWorkMaxValues } from '../work-limits.mts'

const RELEVANCE_SCOPE = 'post-relevance-cohort-1'
const TOPIC_BEST_SCOPE = 'post-best-topic-cohort-1'
const FOLLOWING_SCOPE = 'post-following-phase-1'
export const FOLLOWING_PHASE_START_ID = '00000000-0000-7000-8000-000000000000'

export type RankedCohortCursor =
  | {
      kind: 'within'
      hi: string
      lo: string
      older: boolean
      cap: number
      ranking: number
      id: string
    }
  | { kind: 'next'; id: string }
export type FollowingCursor =
  | { phase: 'followed' | 'other'; id: string }
  | { phase: 'other'; id: string; start: true }

/** These shapes are intentionally opaque to REST and MCP clients. */
export function encodeRelevanceCursor(cursor: RelevanceCursor): string {
  return encodeRankedCohortCursor(cursor, RELEVANCE_SCOPE)
}

export function decodeRelevanceCursor(encoded: string): RelevanceCursor {
  return decodeRankedCohortCursor(encoded, RELEVANCE_SCOPE, 'Invalid relevance cohort cursor')
}

export function encodeTopicBestCursor(cursor: RankedCohortCursor): string {
  return encodeRankedCohortCursor(cursor, TOPIC_BEST_SCOPE)
}

export function decodeTopicBestCursor(encoded: string): RankedCohortCursor {
  return decodeRankedCohortCursor(encoded, TOPIC_BEST_SCOPE, 'Invalid topic best cohort cursor')
}

export type RelevanceCursor = RankedCohortCursor

function encodeRankedCohortCursor(cursor: RankedCohortCursor, scope: string): string {
  return encodeCursor({ scope, ...cursor })
}

function decodeRankedCohortCursor(
  encoded: string,
  scope: string,
  errorMessage: string,
): RankedCohortCursor {
  const cursor = decodeRecord(encoded, scope)
  if (
    cursor.kind === 'next' &&
    exactKeys(cursor, ['scope', 'kind', 'id']) &&
    isUuidString(cursor.id)
  )
    return { kind: 'next', id: cursor.id }
  if (
    cursor.kind === 'within' &&
    exactKeys(cursor, ['scope', 'kind', 'hi', 'lo', 'older', 'cap', 'ranking', 'id']) &&
    isUuidString(cursor.hi) &&
    isUuidString(cursor.lo) &&
    isUuidString(cursor.id) &&
    cursor.hi >= cursor.lo &&
    cursor.id <= cursor.hi &&
    cursor.id >= cursor.lo &&
    typeof cursor.older === 'boolean' &&
    typeof cursor.cap === 'number' &&
    Number.isInteger(cursor.cap) &&
    cursor.cap >= 1 &&
    cursor.cap <= postsWorkMaxValues.post_search_filter_candidate_limit &&
    typeof cursor.ranking === 'number' &&
    Number.isFinite(cursor.ranking)
  ) {
    return {
      kind: 'within',
      hi: cursor.hi,
      lo: cursor.lo,
      older: cursor.older,
      cap: cursor.cap,
      ranking: cursor.ranking,
      id: cursor.id,
    }
  }
  throw createHttpError(400, errorMessage)
}

export function encodeFollowingCursor(cursor: FollowingCursor): string {
  return encodeCursor({ scope: FOLLOWING_SCOPE, ...cursor })
}

export function decodeFollowingCursor(encoded: string): FollowingCursor {
  const cursor = decodeRecord(encoded, FOLLOWING_SCOPE)
  if (cursor.phase !== 'followed' && cursor.phase !== 'other')
    throw createHttpError(400, 'Invalid following cursor')
  if (
    cursor.phase === 'other' &&
    cursor.start === true &&
    exactKeys(cursor, ['scope', 'phase', 'id', 'start']) &&
    cursor.id === FOLLOWING_PHASE_START_ID
  )
    return { phase: 'other', id: cursor.id, start: true }
  if (exactKeys(cursor, ['scope', 'phase', 'id']) && isUuidString(cursor.id))
    return { phase: cursor.phase, id: cursor.id }
  throw createHttpError(400, 'Invalid following cursor')
}

function decodeRecord(encoded: string, scope: string): Record<string, unknown> {
  const cursor = decodeCursor(encoded) as unknown as Record<string, unknown>
  if (cursor.scope !== scope) throw createHttpError(400, 'Invalid cursor scope')
  return cursor
}

function exactKeys(cursor: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(cursor)
  return keys.length === expected.length && expected.every(key => Object.hasOwn(cursor, key))
}

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && isUUID(value)
}
