import createHttpError from 'http-errors'
import { decodeCursor, encodeCursor, hasExactKeys } from '@modules/pagination'
import { isUUID } from '@modules/utils/ids'
import type { PageInfo } from '@voucha/types/pagination'
import type { PostFeedResponse } from '../../types.mts'
import type { PostFeedWalkSort } from './eligible-posts-cte.mts'

const SCOPES = {
  new: 'post-feed-new-inspected-1',
  best: 'post-feed-best-inspected-1',
  hot: 'post-feed-hot-stable-inspected-1',
} as const
const INVALID = 'Invalid cursor format for post feed'

export type PostFeedCursor =
  | { sort: 'new'; sortAt: string; id: string }
  | {
      sort: 'best' | 'hot'
      kind: 'inspected' | 'delivered'
      rank: number
      postId: string
      id: string
      asOf?: number
    }

type Row = Record<string, unknown>

export function parsePostFeedCursor(
  after: string | undefined,
  sort: PostFeedWalkSort,
): PostFeedCursor | null {
  if (!after) return null
  let decoded: unknown
  try {
    decoded = decodeCursor(after)
  } catch {
    throw createHttpError(400, INVALID)
  }
  if (!isRecord(decoded) || decoded.scope !== SCOPES[sort]) throw createHttpError(400, INVALID)
  if (sort === 'new') {
    if (
      !hasExactKeys(decoded, ['scope', 'timestamp', 'id']) ||
      !isPreciseUtcTimestamp(decoded.timestamp) ||
      !isUuidString(decoded.id)
    )
      throw createHttpError(400, INVALID)
    return { sort, sortAt: decoded.timestamp, id: decoded.id }
  }
  const hot = sort === 'hot'
  const commonKeys = hot
    ? ['scope', 'kind', 'rank', 'post_id', 'id', 'as_of']
    : ['scope', 'kind', 'rank', 'post_id', 'id']
  if (
    !isFiniteNumber(decoded.rank) ||
    !isUuidString(decoded.post_id) ||
    (hot && !isValidInstant(decoded.as_of))
  )
    throw createHttpError(400, INVALID)
  const asOf = hot ? { asOf: decoded.as_of as number } : {}
  if (
    (decoded.kind === 'inspected' || decoded.kind === 'delivered') &&
    hasExactKeys(decoded, commonKeys) &&
    isUuidString(decoded.id)
  )
    return {
      sort,
      kind: decoded.kind,
      rank: decoded.rank,
      postId: decoded.post_id,
      id: decoded.id,
      ...asOf,
    }
  throw createHttpError(400, INVALID)
}

export function mapPostFeedResponse(
  rows: Row[],
  safeLimit: number,
  sort: PostFeedWalkSort,
  asOf: Date,
): PostFeedResponse {
  const visibleRows = rows.filter(row => typeof row.result_id === 'string')
  const pageRows = visibleRows.slice(0, safeLimit)
  const metadata = rows[0]
  const hasNextPage = visibleRows.length > safeLimit || metadata?.raw_has_more === true
  const first = pageRows[0]
  const last = pageRows.at(-1)
  const inspected = pageRows.length < safeLimit && hasNextPage
  const end = inspected ? metadata : last
  const pageInfo: PageInfo = {
    has_next_page: hasNextPage,
    start_cursor: first ? encodeFeedCursor(first, sort, asOf, false) : null,
    end_cursor: hasNextPage && end ? encodeFeedCursor(end, sort, asOf, inspected) : null,
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

function encodeFeedCursor(
  row: Row,
  sort: PostFeedWalkSort,
  asOf: Date,
  inspected: boolean,
): string {
  if (sort === 'new') {
    const timestamp = inspected ? row.inspected_sort_at : row.cursor_sort_at
    const id = inspected ? row.inspected_id : row.result_id
    if (!isPreciseUtcTimestamp(timestamp) || !isUuidString(id))
      throw new Error('Missing feed inspection boundary')
    return encodeCursor({ scope: SCOPES.new, timestamp, id })
  }
  const rank = inspected ? row.inspected_rank : row.delivery_rank
  const postId = inspected ? row.inspected_post_id : row.entity_id
  if (!isFiniteNumber(rank) || !isUuidString(postId))
    throw new Error('Missing ranked feed inspection boundary')
  const cursor = {
    scope: SCOPES[sort],
    kind: inspected ? 'inspected' : 'delivered',
    rank,
    post_id: postId,
    ...(sort === 'hot' ? { as_of: asOf.getTime() } : {}),
  }
  const id = inspected ? row.inspected_id : row.result_id
  if (!isUuidString(id)) throw new Error('Missing feed delivery ID')
  return encodeCursor({ ...cursor, id })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && isUUID(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidInstant(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    Number.isFinite(new Date(value).getTime())
  )
}

function isPreciseUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  )
}
