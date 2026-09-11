import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, encodeCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { CommunityPostReview } from '../types.mts'
import sql from 'sql-template-strings'
import assert from 'http-assert'

export { searchCommunityPosts } from './approved-posts.mts'
export { getApprovedReviewsForPost } from './approved-reviews.mts'
type CommunityFeedPost = {
  id: string
  [key: string]: unknown
}

export async function searchPendingPosts(
  communityId: string,
  options?: QueryOptions & {
    limit?: number
    after?: string
  },
): Promise<{ results: CommunityFeedPost[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* searchPendingPosts */
    SELECT p.*, cpr.escalated_at, cpr.escalated_by_id
    FROM community_post_reviews cpr
    JOIN view_posts p ON p.id = cpr.post_id
    WHERE cpr.community_id = ${communityId}
      AND p.community_id = ${communityId}
      AND p.deleted_at IS NULL
      AND cpr.approved_at IS NULL
      AND cpr.rejected_at IS NULL
      AND cpr.unpublished_at IS NULL
  `

  if (cursorId !== undefined) {
    query.append(sql` AND p.id > ${cursorId}`)
  }

  query.append(sql`
    ORDER BY p.id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityFeedPost[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityFeedPost)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              name: results[results.length - 1]!.id,
              id: results[results.length - 1]!.id,
            })
          : null,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0]!.id, id: results[0]!.id }) : null,
    },
  }
}

export async function getCommunityPostReview(
  communityId: string,
  postId: string,
): Promise<CommunityPostReview | null> {
  const { rows } = await read(sql`/* getCommunityPostReview */
    SELECT *
    FROM community_post_reviews
    WHERE community_id = ${communityId}
      AND post_id = ${postId}
    LIMIT 1
  `)
  return (rows[0] as CommunityPostReview) ?? null
}
