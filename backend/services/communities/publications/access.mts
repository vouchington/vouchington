import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanModerateCommunity } from '../authorization.mts'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import type { Community, CommunityPostReview } from '../types.mts'

export async function getPublicationReview(
  communityId: string,
  postId: string,
): Promise<CommunityPostReview | null> {
  const { rows } = await read(
    sql`/* getReview */
    SELECT *
    FROM community_post_reviews
    WHERE community_id = ${communityId}
      AND post_id = ${postId}
    LIMIT 1
    `,
  )
  return (rows[0] as CommunityPostReview) ?? null
}

export async function assertModeratorAccess(
  currentUser: PrivateUser,
  communityId: string,
): Promise<Community> {
  const [community, membership] = await Promise.all([
    getCommunity(communityId),
    getCommunityMember(communityId, currentUser.id),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')
  return community
}
