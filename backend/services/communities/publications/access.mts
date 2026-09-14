import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users'
import {
  currentUserCanModerateCommunity,
  currentUserCanModerateCommunityPublication,
} from '../authorization.mts'
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

export type CommunityPublicationReviewChange = {
  id: string
  community_id: string
  post_id: string
  actor_user_id: string | null
  action: 'approve' | 'reject' | 'unpublish' | 'restore'
  platform_override: boolean
  reason_code: string | null
  private_note: string | null
  created_at: Date
}

export async function getPublicationReviewChanges(
  communityId: string,
  postId: string,
): Promise<CommunityPublicationReviewChange[]> {
  const { rows } = await read(
    sql`/* getPublicationReviewChanges */
      SELECT *
      FROM community_post_review_changes
      WHERE community_id = ${communityId}
        AND post_id = ${postId}
      ORDER BY id ASC`,
  )
  return rows as CommunityPublicationReviewChange[]
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

export type PublicationModeratorAccess = {
  community: Community
  isPlatformModerator: boolean
}

/**
 * Publication moderation is the one community surface where site moderators have global
 * authority. Other community-management permissions remain membership-scoped.
 */
export async function assertPublicationModeratorAccess(
  currentUser: PrivateUser,
  communityId: string,
): Promise<PublicationModeratorAccess> {
  const [community, membership] = await Promise.all([
    getCommunity(communityId),
    getCommunityMember(communityId, currentUser.id),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  const isPlatformModerator = isModerationStaff(currentUser)
  assert(
    currentUserCanModerateCommunityPublication(currentUser, community, membership),
    403,
    'Forbidden',
  )
  return { community, isPlatformModerator }
}
