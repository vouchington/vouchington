import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CurrentPaidMembership = {
  plan: 'plus' | 'pro'
  user_id: string
}

export type PrivateUserMembership = {
  id: string
  membership_plan: 'plus' | 'pro' | null
}

export async function getCurrentPaidMembershipForUser(
  userId: string,
): Promise<CurrentPaidMembership[]> {
  const { rows } = await read<CurrentPaidMembership>(sql`/* getCurrentPaidMembership */
    SELECT user_id, plan
    FROM view_current_paid_memberships
    WHERE user_id = ${userId}`)
  return rows
}

export async function getPrivateUserMembershipForUser(
  userId: string,
): Promise<PrivateUserMembership> {
  const { rows } = await read<PrivateUserMembership>(sql`/* getPrivateUserMembership */
    SELECT id, membership_plan
    FROM view_users_private
    WHERE id = ${userId}`)
  return rows[0]!
}
