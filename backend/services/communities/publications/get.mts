import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PageInfo } from '@voucha/types/pagination'
import type { CommunityPostReview } from '../types.mts'
import sql from 'sql-template-strings'
import { buildCommunityIdCursorPage, resolveCommunityIdCursorPage } from '../id-cursor-page.mts'

export { searchCommunityPosts } from './approved-posts.mts'
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
  const { limit, cursorId } = resolveCommunityIdCursorPage(options)

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
  return buildCommunityIdCursorPage(rows as CommunityFeedPost[], limit)
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
