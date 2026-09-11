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
    SELECT COUNT(*) AS count
    FROM community_agent_prompts
    WHERE created_by_id = ${userId}
      AND slot_allocated = true
      AND deleted_at IS NULL
    `,
  )
  return Number((rows[0] as { count: string }).count)
}

export function getSlotLimitForMembership(plan: MembershipPlanSlug | null | undefined): number {
  if (!plan) return 0
  return SLOT_LIMITS_BY_PLAN[plan] ?? 0
}
