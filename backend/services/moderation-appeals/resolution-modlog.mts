import { recordModeratorAction } from '@services/moderator-actions'

export async function logAppealResolution(
  staffUserId: string,
  actionType: 'resolve_appeal' | 'dismiss_appeal',
  appealId: string,
  targetUserId?: string | null,
  communityId?: string | null,
): Promise<void> {
  await recordModeratorAction(staffUserId, {
    actionType,
    moderationAppealId: appealId,
    targetUserId: targetUserId ?? null,
    communityId: communityId ?? null,
  })
}
