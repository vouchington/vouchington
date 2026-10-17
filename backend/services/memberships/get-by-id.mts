import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Membership } from './types.mts'

export async function getLatestMembershipByUserId(userId: string): Promise<Membership | null> {
  const { rows } = await read(sql`/* getLatestMembershipByUserId */
    WITH selected AS MATERIALIZED (
      SELECT id FROM memberships
      WHERE user_id = ${userId} AND projection_ended_at IS NULL
      ORDER BY id DESC LIMIT 1
    )
    SELECT membership.*
    FROM selected
    JOIN view_memberships membership ON membership.id = selected.id
  `)
  return (rows[0] as Membership) ?? null
}
