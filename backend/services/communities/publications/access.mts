import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users'
import {
  currentUserCanModerateCommunity,
  currentUserCanModerateCommunityPublication,
} from '../authorization.mts'
import { getCommunityWithViewer } from '../load-with-viewer.mts'
import type { Community, CommunityPostReview } from '../types.mts'

export async function getPublicationReview(
  communityId: string,
  postId: string,
): Promise<CommunityPostReview | null> {
  const { rows } = await read(
    sql`/* getReview */
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
    `,
  )
  return (rows[0] as CommunityPostReview) ?? null
}

export async function assertModeratorAccess(
  currentUser: PrivateUser,
  communityId: string,
): Promise<Community> {
  const loaded = await getCommunityWithViewer(communityId, currentUser.id)
  assert(loaded, 404, 'Community not found')
  const { community, membership } = loaded
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
  const loaded = await getCommunityWithViewer(communityId, currentUser.id)
  assert(loaded, 404, 'Community not found')
  const { community, membership } = loaded
  assert(!community.archived_at, 403, 'Community is archived')
  const isPlatformModerator = isModerationStaff(currentUser)
  assert(
    currentUserCanModerateCommunityPublication(currentUser, community, membership),
    403,
    'Forbidden',
  )
  return { community, isPlatformModerator }
}
