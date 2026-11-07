import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PageInfo } from '@voucha/types/pagination'
import type { CommunityPostReview } from '../types.mts'
import sql from 'sql-template-strings'
import { encodeCursor } from '@modules/pagination'
import { resolveCommunityIdCursorPage } from '../id-cursor-page.mts'

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
    WITH review_page AS MATERIALIZED (
      SELECT cpr.post_id, cpr.escalated_at, cpr.escalated_by_id
      FROM community_post_reviews cpr
      WHERE cpr.community_id = ${communityId}
        AND cpr.approved_at IS NULL
        AND cpr.rejected_at IS NULL
        AND cpr.unpublished_at IS NULL
  `
  if (cursorId !== undefined) query.append(sql` AND cpr.post_id > ${cursorId}`)
  query.append(sql`
      ORDER BY cpr.post_id ASC
      LIMIT ${limit + 1}
    )
    SELECT hydrated.*, page.escalated_at, page.escalated_by_id, page.post_id AS inspected_post_id,
      (hydrated.id IS NOT NULL) AS kept
    FROM review_page page
    LEFT JOIN posts live_post
      ON live_post.id = page.post_id
     AND live_post.community_id = ${communityId}
     AND live_post.deleted_at IS NULL
    LEFT JOIN view_posts hydrated ON hydrated.id = live_post.id
    ORDER BY page.post_id ASC
  `)

  const { rows } = await read<CommunityFeedPost & { kept: boolean; inspected_post_id: string }>(
    query,
    options,
  )
  const hasNextPage = rows.length > limit
  const inspected = rows.slice(0, limit)
  const results = inspected.flatMap(row => {
    if (!row.kept) return []
    const { kept, inspected_post_id: _inspectedPostId, ...result } = row
    void kept
    void _inspectedPostId
    return [result]
  })
  const endId = inspected.at(-1)?.inspected_post_id
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && endId ? encodeCursor({ name: endId, id: endId }) : null,
      start_cursor: results[0] ? encodeCursor({ name: results[0].id, id: results[0].id }) : null,
    },
  }
}

export async function getCommunityPostReview(
  communityId: string,
  postId: string,
): Promise<CommunityPostReview | null> {
  const { rows } = await read(sql`/* getCommunityPostReview */
    SELECT community_id, post_id, submitted_by_id, created_at, reviewed_at, reviewed_by_id,
      approved_at, rejected_at, rejection_reason, unpublished_at, unpublished_by_id,
      platform_override_at, platform_override_by_id, platform_override_action,
      platform_override_reason_code, platform_override_private_note, automod_action,
      automod_flagged_at, automod_flagged_content_sha256, automod_dismissed_at,
      automod_dismissed_by_id
    FROM community_post_reviews
    WHERE community_id = ${communityId}
      AND post_id = ${postId}
    LIMIT 1
  `)
  return (rows[0] as CommunityPostReview) ?? null
}
