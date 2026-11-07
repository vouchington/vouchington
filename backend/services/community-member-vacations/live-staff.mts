import { read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Owner or moderator, not removed, and not inside a vacation at the observed time. */
export async function userHasLiveCommunityStaffRole(
  userId: string,
  communityId: string,
  options?: { observedTime?: Date | null; query?: TransactionQuery },
): Promise<boolean> {
  const observedTime = options?.observedTime ?? null
  const statement = sql`/* userHasLiveCommunityStaffRole */
    SELECT 1
    FROM community_members cm
    WHERE cm.community_id = ${communityId}
      AND cm.user_id = ${userId}
      AND cm.role IN ('owner', 'moderator')
      AND cm.removed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM community_member_vacations v
        WHERE v.community_id = cm.community_id
          AND v.user_id = cm.user_id
          AND v.starts_at <= COALESCE(${observedTime}::timestamptz, now())
          AND (v.ends_at IS NULL OR v.ends_at > COALESCE(${observedTime}::timestamptz, now()))
      )
    LIMIT 1
  `
  if (options?.query) {
    const { rows } = await options.query(statement)
    return rows.length > 0
  }
  const { rows } = await read(statement)
  return rows.length > 0
}
