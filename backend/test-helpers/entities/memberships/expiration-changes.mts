import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestMembershipExpirationChanges(
  grantId: string,
): Promise<Array<{ latest: boolean; effects: number; expired: boolean }>> {
  const { rows } = await read<{ latest: boolean; effects: number; expired: boolean }>(
    sql`/* readTestMembershipExpirationChanges */
      SELECT membership.latest_change_id = change.id AS latest, change.expired_at IS NOT NULL AS expired,
        (SELECT count(*)::int FROM membership_entitlement_effects effect
          WHERE effect.membership_change_id = change.id) AS effects
      FROM membership_changes change
      JOIN memberships membership ON membership.id = change.membership_id
      WHERE change.membership_grant_id = ${grantId}
        AND change.change_type = 'expiration'`,
  )
  return rows
}
