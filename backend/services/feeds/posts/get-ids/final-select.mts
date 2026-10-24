import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import { appendTimestampCursorFilter } from './cursor-filter.mts'
import type { PostFeedCursor } from './feed-cursor.mts'
import type { PostFeedOptions } from '../../types.mts'

type PostFeedSort = NonNullable<PostFeedOptions['sort']>

export function appendPostFeedFinalSelect(
  query: SQLStatement,
  {
    cursor,
    safeLimit,
    sort,
  }: {
    cursor: PostFeedCursor
    safeLimit: number
    sort: PostFeedSort
  },
): void {
  query.append(sql`
    SELECT
      combined_posts.result_id,
      combined_posts.entity_id,
      combined_posts.post_type,
      combined_posts.sort_at,
      combined_posts.delivery_type,
      combined_posts.shared_by_id,
      combined_posts.shared_at`)
  query.append(hotScoreColumn(sort))
  query.append(sql`
    FROM combined_posts
    WHERE 1 = 1
  `)
  appendCursorFilter(query, { cursor, sort })
  query.append(orderAndLimit(sort, safeLimit))
}

function hotScoreColumn(sort: PostFeedSort): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql`,\n      combined_posts.hot_score`
    case 'new':
      return sql``
    default:
      return assertNever(sort, 'Unknown post feed sort')
  }
}

function orderAndLimit(sort: PostFeedSort, safeLimit: number): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql`
    ORDER BY combined_posts.hot_score DESC, combined_posts.result_id DESC
    LIMIT ${safeLimit + 1}
  `
    case 'new':
      return sql`
    ORDER BY combined_posts.sort_at DESC, combined_posts.result_id DESC
    LIMIT ${safeLimit + 1}
  `
    default:
      return assertNever(sort, 'Unknown post feed sort')
  }
}

function appendCursorFilter(
  query: SQLStatement,
  { cursor, sort }: { cursor: PostFeedCursor; sort: PostFeedSort },
): void {
  if (sort === 'hot' && cursor.hot_score_lt !== undefined && cursor.id_lt) {
    query.append(sql`
      AND (combined_posts.hot_score, combined_posts.result_id) < (${cursor.hot_score_lt}, ${cursor.id_lt})
    `)
  } else
    appendTimestampCursorFilter(query, {
      cursor,
      idColumn: sql`combined_posts.result_id`,
      sortAtColumn: sql`combined_posts.sort_at`,
    })
}
