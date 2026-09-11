import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CurrentMembershipProjection = {
  active: boolean
  id: string
  source_kind: 'admin_grant' | 'direct' | 'family'
}

export async function getCurrentMembershipProjection(
  userId: string,
  query: QueryExecutor,
): Promise<CurrentMembershipProjection | undefined> {
  const { rows } = await query(sql`/* getCurrentMembershipProjection */
    SELECT membership.id, source.source_kind,
      membership.cancelled_at IS NULL AND membership.expired_at IS NULL
        AND membership.paused_at IS NULL
        AND (
          source.source_kind = 'direct'
          OR (
            membership.past_due_at IS NULL
            AND (membership.expires_at IS NULL OR membership.expires_at > CURRENT_TIMESTAMP)
          )
        )
        AS active
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    WHERE membership.user_id = ${userId} AND membership.projection_ended_at IS NULL
    LIMIT 1`)
  return rows[0] as CurrentMembershipProjection | undefined
}
