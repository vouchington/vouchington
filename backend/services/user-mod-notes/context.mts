import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { computeTrustTier, getAccountAgeMs } from '@services/user-rate-limits/trust-tier'
import { getUserRateLimitContext } from '@services/user-rate-limits/context'

export interface UserModerationContext {
  account_age_ms: number
  trust_tier: number | null
  active_suspension: { suspended_at: Date; suspended_reason: string | null } | null
  content_removal_count: number
  community_removal_count: number
}

export async function getUserModerationContext(
  _currentUser: PrivateUser,
  targetUser: PrivateUser,
  isStaff: boolean,
): Promise<UserModerationContext> {
  const account_age_ms = getAccountAgeMs(targetUser)

  let trust_tier: number | null = null
  if (isStaff) {
    const ctx = await getUserRateLimitContext(targetUser.id)
    trust_tier = computeTrustTier(targetUser, ctx)
  }

  const active_suspension =
    targetUser.suspended_at != null
      ? {
          suspended_at: targetUser.suspended_at,
          suspended_reason: targetUser.suspended_reason ?? null,
        }
      : null

  const { rows } = await read(sql`/* getUserModerationContextCounts */
    SELECT
      (
        SELECT count(*)::int FROM posts
        WHERE created_by_id = ${targetUser.id}
          AND deleted_by_id IS NOT NULL
          AND deleted_by_id <> created_by_id
      ) AS content_removal_count,
      (
        SELECT count(*)::int FROM community_members
        WHERE user_id = ${targetUser.id}
          AND removed_at IS NOT NULL
          AND removed_by_id IS NOT NULL
          AND removed_by_id <> user_id
      ) AS community_removal_count
  `)

  const counts = rows[0] as { content_removal_count: number; community_removal_count: number }

  return {
    account_age_ms,
    trust_tier,
    active_suspension,
    content_removal_count: counts.content_removal_count,
    community_removal_count: counts.community_removal_count,
  }
}
