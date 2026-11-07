import createError from 'http-errors'
import { userHasLiveCommunityStaffRole } from '@services/community-member-vacations/live-staff'

/** Staff-only threads are readable by a live owner or moderator, not by a participant row. */
export async function assertLiveModInternalReader(
  userId: string,
  communityId: string,
): Promise<void> {
  if (!(await userHasLiveCommunityStaffRole(userId, communityId))) {
    throw createError(403, 'Forbidden')
  }
}
