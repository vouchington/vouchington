import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPlanSlug } from '@services/memberships/types'

export const SLOT_LIMITS_BY_PLAN: Record<MembershipPlanSlug, number> = {
  plus: 3,
  pro: 10,
}

export async function getUsedSlotsForUser(userId: string): Promise<number> {
  const { rows } = await read(
    sql`/* getUsedSlotsForUser */
    SELECT allocated_count
    FROM community_agent_prompt_slot_counts
    WHERE creator_user_id = ${userId}
    `,
  )
  return (rows[0] as { allocated_count: number } | undefined)?.allocated_count ?? 0
}

export function getSlotLimitForMembership(plan: MembershipPlanSlug | null | undefined): number {
  if (!plan) return 0
  return SLOT_LIMITS_BY_PLAN[plan] ?? 0
}
