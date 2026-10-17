import assert from 'http-assert'
import {
  currentUserCanManageCommunityBans,
  currentUserCanManageCommunityList,
  currentUserCanModerateCommunity,
  currentUserCanUpdateCommunity,
  currentUserCanDeleteCommunity,
  getCommunityOrThrow,
  loadCommunityForModerator,
  loadCommunityWithViewer,
} from '@services/communities'
import { currentUserCanViewCommunityModlog } from '@services/moderator-actions'
import { currentUserCanSetOwnModeratorVacation } from '@services/community-member-vacations'
import { currentUserCanManageSavedReplies } from '@services/modmail'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'

/** REST grants platform moderators community publication/claim access without membership. */
export async function staffOrModeratorCommunity(currentUser: PrivateUser, community: string) {
  if (isModerationStaff(currentUser)) {
    return { community: await getCommunityOrThrow(community), membership: null }
  }
  return loadCommunityForModerator(currentUser, community)
}

export async function communityWithGuard(
  currentUser: PrivateUser,
  community: string,
  guard:
    | 'moderate'
    | 'bans'
    | 'list'
    | 'owner'
    | 'archive'
    | 'modlog'
    | 'vacation'
    | 'saved_replies',
) {
  const loaded = await loadCommunityWithViewer(community, currentUser.id)
  const { community: entity, membership } = loaded
  const allowed = {
    moderate: currentUserCanModerateCommunity,
    bans: currentUserCanManageCommunityBans,
    list: currentUserCanManageCommunityList,
    owner: currentUserCanUpdateCommunity,
    archive: currentUserCanDeleteCommunity,
    modlog: currentUserCanViewCommunityModlog,
    vacation: currentUserCanSetOwnModeratorVacation,
    saved_replies: currentUserCanManageSavedReplies,
  }[guard](currentUser, entity, membership)
  if (
    !allowed &&
    guard === 'modlog' &&
    entity.visibility !== 'public' &&
    !isModerationStaff(currentUser) &&
    !membership
  ) {
    assert(false, 404, 'Forbidden')
  }
  assert(allowed, 403, 'Forbidden')
  return loaded
}
