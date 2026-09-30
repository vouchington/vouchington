import type { QueryOptions } from '@data-stores/psql/types'
import { recordModeratorAction } from '@services/moderator-actions'

export async function logAppealResolution(
  staffUserId: string,
  actionType: 'resolve_appeal' | 'dismiss_appeal',
  appealId: string,
  targetUserId: string | null | undefined,
  communityId: string | null | undefined,
  options: QueryOptions,
): Promise<void> {
  await recordModeratorAction(
    staffUserId,
    {
      actionType,
      moderationAppealId: appealId,
      targetUserId: targetUserId ?? null,
      communityId: communityId ?? null,
    },
    options,
  )
}
