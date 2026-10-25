import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'

/** Returns true when this post is the user's first non-deleted post in the community. */
export async function isFirstCommunityPost(
  communityId: string,
  userId: string,
  postId: string,
): Promise<boolean> {
  if (userId === DELETED_USER_ID) return false
  const { rows } = await read<{ is_first: boolean }>(sql`/* isFirstCommunityPost */
    SELECT (
      SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: an earlier post can be attached to this community later, so finding the first post requires all ID partitions
      FROM posts
      WHERE created_by_id = ${userId}
        AND community_id = ${communityId}
        AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1
    ) = ${postId} AS is_first
  `)
  return rows[0]?.is_first ?? false
}
