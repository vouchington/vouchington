import sql from 'sql-template-strings'
import type { AppealTargetContext } from './create-target-types.mts'

/**
 * The conflict clause of the appeal insert, named for the partial unique index of the target kind
 * so that only a second open appeal for the same target is absorbed and any other violation still
 * raises. A warning refreshes the reason of the open appeal; every other kind skips the insert
 * rather than raise a unique violation, which would abort the caller's transaction.
 */
export function appealConflictClause({
  userWarningId,
  communityBanId,
  postId,
}: AppealTargetContext) {
  if (userWarningId)
    return sql`ON CONFLICT (appellant_user_id, user_warning_id)
      WHERE resolved_at IS NULL AND user_warning_id IS NOT NULL
      DO UPDATE SET appeal_reason = EXCLUDED.appeal_reason`
  if (communityBanId)
    return sql`ON CONFLICT (appellant_user_id, community_ban_id)
      WHERE resolved_at IS NULL AND community_ban_id IS NOT NULL DO NOTHING`
  if (postId)
    return sql`ON CONFLICT (appellant_user_id, post_id, post_removal_kind)
      WHERE resolved_at IS NULL AND post_id IS NOT NULL DO NOTHING`
  return sql`ON CONFLICT (appellant_user_id, user_suspension_id)
      WHERE resolved_at IS NULL AND user_suspension_id IS NOT NULL DO NOTHING`
}
