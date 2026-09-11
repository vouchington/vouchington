import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Membership } from './types.mts'

export async function getLatestMembershipByUserId(userId: string): Promise<Membership | null> {
  const { rows } = await read(sql`/* getLatestMembershipByUserId */
    SELECT * FROM view_memberships WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1
  `)
  return (rows[0] as Membership) ?? null
}

export async function getMembershipById(membershipId: string): Promise<Membership | null> {
  const { rows } = await read(sql`/* getMembershipById */
    SELECT * FROM view_memberships WHERE id = ${membershipId} LIMIT 1
  `)
  return (rows[0] as Membership) ?? null
}
