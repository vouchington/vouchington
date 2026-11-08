import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type MembershipExpiration = {
  membershipId: string
  membershipSourceId: string
  membershipGrantId: string
  membershipProductId: string
  expiredAt: Date
}

/**
 * Records one `expiration` membership change per row, its entitlement effect, and the memberships'
 * latest-change pointers in three set statements. The caller's rows come from one UPDATE ... RETURNING
 * over a user's paused grants, so the batch is bounded by that user's grants.
 */
export async function recordMembershipExpirations(
  userId: string,
  expirations: readonly MembershipExpiration[],
  query: QueryExecutor,
): Promise<void> {
  if (expirations.length === 0) return
  const { rows } = await query<{ id: string }>(sql`/* recordMembershipExpirations */
    INSERT INTO membership_changes (
      membership_id, user_id, membership_source_id, membership_grant_id, change_type,
      from_membership_product_id, expired_at
    )
    SELECT input.membership_id, ${userId}, input.source_id, input.grant_id,
      'expiration'::membership_change_types, input.product_id, input.expired_at
    FROM unnest(
      ${expirations.map(row => row.membershipId)}::uuid[],
      ${expirations.map(row => row.membershipSourceId)}::uuid[],
      ${expirations.map(row => row.membershipGrantId)}::uuid[],
      ${expirations.map(row => row.membershipProductId)}::uuid[],
      ${expirations.map(row => row.expiredAt)}::timestamptz[]
    ) WITH ORDINALITY AS input(membership_id, source_id, grant_id, product_id, expired_at, position)
    ORDER BY input.position
    RETURNING id`)
  const changeIds = rows.map(row => row.id)
  await query(sql`/* recordMembershipExpirations: entitlement effects */
    INSERT INTO membership_entitlement_effects (membership_change_id, user_id)
    SELECT change_id, ${userId} FROM unnest(${changeIds}::uuid[]) AS change(change_id)
    ORDER BY change_id
    ON CONFLICT (membership_change_id) DO NOTHING`)
  await query(sql`/* recordMembershipExpirations: latest change */
    UPDATE memberships m
    SET latest_change_id = newest.id
    FROM (
      SELECT DISTINCT ON (membership_id) id, membership_id, created_at
      FROM membership_changes WHERE id = ANY(${changeIds}::uuid[])
      ORDER BY membership_id, id DESC
    ) newest
    WHERE m.id = newest.membership_id
      AND (
        m.latest_change_id IS NULL
        OR EXISTS (
          SELECT 1 FROM membership_changes current_change
          WHERE current_change.id = m.latest_change_id
            AND current_change.id < newest.id
        )
      )`)
}
