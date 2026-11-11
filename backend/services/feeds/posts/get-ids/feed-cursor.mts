import {
  decodeUuidCursor,
  encodeCursor,
  hasExactKeys,
  isPreciseTimestampCursor,
} from '@modules/pagination'
import { isUUID } from '@modules/utils/ids'
import type { PageInfo } from '@voucha/types/pagination'
import type { PostFeedResponse } from '../../types.mts'
import type { PostFeedWalkSort } from './eligible-posts-cte.mts'

/** Plain keysets: each cursor is the last returned row's sort key. */
export type PostFeedCursor =
  | { sort: 'new'; sortAt: string; id: string }
  | { sort: 'hot'; score: number; id: string; asOf: number }
  | { sort: 'best'; score: number; postId: string; id: string }

const INVALID = 'Invalid cursor format for post feed'

type Fields = Record<string, unknown> & { id: string }

const isHotCursor = (row: unknown): row is Fields & { score: number; as_of: number } =>
  isRecord(row) &&
  hasExactKeys(row, ['score', 'id', 'as_of']) &&
  isFiniteNumber(row.score) &&
  Number.isSafeInteger(row.as_of) &&
  Number.isFinite(new Date(row.as_of as number).getTime())
const isBestCursor = (row: unknown): row is Fields & { score: number; post_id: string } =>
  isRecord(row) &&
  hasExactKeys(row, ['score', 'post_id', 'id']) &&
  isFiniteNumber(row.score) &&
  typeof row.post_id === 'string' &&
  isUUID(row.post_id)

function isRecord(row: unknown): row is Fields {
  return typeof row === 'object' && row !== null
}

export function parsePostFeedCursor(
  after: string | undefined,
  sort: PostFeedWalkSort,
): PostFeedCursor | null {
  if (!after) return null
  if (sort === 'new') {
    const row = decodeUuidCursor(after, isPreciseTimestampCursor, INVALID)
    return { sort, sortAt: row.timestamp, id: row.id }
  }
  if (sort === 'hot') {
    const row = decodeUuidCursor(after, isHotCursor, INVALID)
    return { sort, score: row.score, id: row.id, asOf: row.as_of }
  }
  const row = decodeUuidCursor(after, isBestCursor, INVALID)
  return { sort, score: row.score, postId: row.post_id, id: row.id }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

type Row = Record<string, unknown>

function cursorOf(row: Row, sort: PostFeedWalkSort, asOf: Date): Record<string, unknown> {
  const id = row.result_id as string
  if (sort === 'new') return { timestamp: row.cursor_sort_at as string, id }
  if (sort === 'hot') return { score: Number(row.hot_score), id, as_of: asOf.getTime() }
  return { score: Number(row.best_score), post_id: row.entity_id as string, id }
}

export function mapPostFeedResponse(
  rows: Row[],
  safeLimit: number,
  sort: PostFeedWalkSort,
  asOf: Date,
  inspectedRowCap: number = Number.POSITIVE_INFINITY,
): PostFeedResponse {
  const metadata = rows[0]
  const deliveries = rows.filter(row => row.result_id)
  const hasMoreResults = deliveries.length > safeLimit
  const inspectedTail =
    metadata && Number(metadata.inspected_rows) >= inspectedRowCap
      ? {
          result_id: metadata.inspected_result_id,
          entity_id: metadata.inspected_entity_id,
          cursor_sort_at: metadata.inspected_sort_at,
          hot_score: metadata.inspected_hot_score,
          best_score: metadata.inspected_best_score,
        }
      : undefined
  const hasNextPage = hasMoreResults || inspectedTail !== undefined
  const pageRows = deliveries.slice(0, safeLimit)
  const last = pageRows.at(-1)
  const first = pageRows[0]
  const continuation = hasMoreResults ? last : (inspectedTail ?? last)
  const pageInfo: PageInfo = {
    has_next_page: hasNextPage,
    start_cursor: first ? encodeCursor(cursorOf(first, sort, asOf)) : null,
    end_cursor:
      hasNextPage && continuation ? encodeCursor(cursorOf(continuation, sort, asOf)) : null,
  }
  return {
    results: pageRows.map(row => ({
      __entity_type: 'post' as const,
      id: row.result_id as string,
      entity_id: row.entity_id as string,
      post_type: row.post_type as string,
      delivery_type: row.delivery_type as 'direct' | 'share',
      ...(row.shared_by_id ? { shared_by_id: row.shared_by_id as string } : {}),
      ...(row.shared_at ? { shared_at: row.shared_at as Date } : {}),
    })),
    page_info: pageInfo,
  }
}
