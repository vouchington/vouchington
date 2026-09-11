import {
  buildPageInfo,
  decodeUuidCursor,
  isScoreCursor,
  isTimestampCursor,
} from '@modules/pagination'
import type { PostFeedResponse } from '../../types.mts'

export type PostFeedCursor = {
  created_at_lt?: number
  hot_score_lt?: number
  id_lt?: string
}

export function parsePostFeedCursor(after: string | undefined, sort: string): PostFeedCursor {
  if (!after) return {}
  if (sort === 'hot') {
    const cursor = decodeUuidCursor(after, isScoreCursor, 'Invalid cursor format for post feed')
    return { hot_score_lt: cursor.score, id_lt: cursor.id }
  }
  const cursor = decodeUuidCursor(after, isTimestampCursor, 'Invalid cursor format for post feed')
  return { created_at_lt: cursor.timestamp, id_lt: cursor.id }
}

export function mapPostFeedResponse(
  rows: Record<string, unknown>[],
  safeLimit: number,
  sort: string,
): PostFeedResponse {
  const hasNextPage = rows.length > safeLimit
  const resultRows = rows.slice(0, safeLimit)
  const results = resultRows.map(row => ({
    __entity_type: 'post' as const,
    id: row.result_id as string,
    entity_id: row.entity_id as string,
    post_type: row.post_type as string,
    delivery_type: row.delivery_type as 'direct' | 'share',
    ...(row.shared_by_user_id ? { shared_by_user_id: row.shared_by_user_id as string } : {}),
    ...(row.shared_at ? { shared_at: row.shared_at as Date } : {}),
  }))
  return {
    results,
    page_info: buildPageInfo(resultRows, {
      hasNextPage,
      getCursor: row =>
        sort === 'hot'
          ? { score: Number(row.hot_score), id: row.result_id as string }
          : {
              timestamp: new Date(row.sort_at as Date | string).getTime(),
              id: row.result_id as string,
            },
    }),
  }
}
